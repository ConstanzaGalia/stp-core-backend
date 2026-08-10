import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Division } from '../../entities/division.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { AthleteInvitation, InvitationStatus } from '../../entities/athlete-invitation.entity';
import { PhysicalEvaluation } from '../../entities/physical-evaluation.entity';
import { STPSessionInstance } from '../../entities/stp-session-instance.entity';
import { UserRole, CompanyAccountType } from '../../common/enums/enums';
import {
  isCoachScopedRole,
  resolveCoachDivisionScope,
} from '../../common/helpers/division-scope.helper';
import { isStpLegacyOnlyPhysicalEvaluation } from '../physical-evaluation/physical-evaluation.service';
import {
  hasAnyProjectedMetric,
  projectCoachDashboardMetrics,
  type CoachDashboardMetricRow,
} from './coach-dashboard-metrics.util';

export type { CoachDashboardMetricRow };

const STAFF_VIEW_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

export type DivisionRosterRecentEval = {
  date: string;
  device: string | null;
  score: number | null;
};

export type RosterTrafficStatus = 'GREEN' | 'YELLOW' | 'RED';

export type DivisionRosterAthlete = {
  userId: string;
  name: string;
  lastName: string;
  email: string;
  positionId: string | null;
  positionName: string | null;
  stpLevel: number | null;
  athleteScore: number | null;
  lastPhysicalEvalDate: string | null;
  lastPhysicalScore: number | null;
  evaluationCount: number;
  daysSinceLastEval: number | null;
  recentEvals: DivisionRosterRecentEval[];
  /** Semáforo de velocidad (Sprint 30 m / criterios). */
  velocityStatus: RosterTrafficStatus | null;
  /** Semáforo de aceleración (Sprint 10 m / criterios). */
  accelerationStatus: RosterTrafficStatus | null;
  /** Semáforo de fuerza (big three / fuerza relativa). */
  strengthStatus: RosterTrafficStatus | null;
  /** Semáforo de CMJ / plataforma. */
  cmjStatus: RosterTrafficStatus | null;
  sessionsTotal: number;
  sessionsCompleted: number;
  adherencePct: number | null;
};

const ROSTER_RECENT_EVALS_LIMIT = 5;

export type DivisionAnalyticsOverview = {
  athleteCount: number;
  evaluatedPhysicalCount: number;
  avgStpScore: number | null;
  avgPhysicalScore: number | null;
  avgAdherencePct: number | null;
};

export type DivisionAnalyticsGroup = DivisionAnalyticsOverview & {
  positionId: string | null;
  positionName: string;
};

export type DivisionAnalyticsResponse = {
  divisionId: string;
  divisionName: string;
  groupBy: 'division' | 'position';
  positionId: string | null;
  overview: DivisionAnalyticsOverview;
  byPosition: DivisionAnalyticsGroup[];
  athletes: DivisionRosterAthlete[];
};

export type CoachDashboardResponse = {
  divisionId: string;
  divisionName: string;
  positionId: string | null;
  athletes: DivisionRosterAthlete[];
  metricRows: CoachDashboardMetricRow[];
};

@Injectable()
export class DivisionAnalyticsService {
  constructor(
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
    @InjectRepository(PhysicalEvaluation)
    private readonly physicalEvalRepository: Repository<PhysicalEvaluation>,
    @InjectRepository(STPSessionInstance)
    private readonly sessionRepository: Repository<STPSessionInstance>,
  ) {}

  async assertCanAccessDivision(actor: User, divisionId: string): Promise<Division> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
      relations: ['coaches'],
    });
    if (!division) throw new NotFoundException('División no encontrada');

    const company = await this.companyRepository.findOne({
      where: { id: division.companyId },
    });
    if (!company) throw new NotFoundException('Centro no encontrado');
    if (company.accountType !== CompanyAccountType.SPORTS_CLUB) {
      throw new ForbiddenException('Las divisiones solo están disponibles para clubes deportivos');
    }

    if (actor.role === UserRole.STP_ADMIN) return division;

    if (!STAFF_VIEW_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Sin permiso');
    }

    const membership = await this.companyRepository
      .createQueryBuilder('c')
      .innerJoin('c.users', 'u', 'u.id = :uid', { uid: actor.id })
      .where('c.id = :cid', { cid: division.companyId })
      .getOne();
    if (!membership) throw new ForbiddenException('No perteneces a este centro');

    if (isCoachScopedRole(actor.role)) {
      const scope = await resolveCoachDivisionScope(
        this.companyRepository,
        this.divisionRepository,
        actor,
        division.companyId,
      );
      if (!scope.divisionIds.includes(divisionId)) {
        throw new ForbiddenException('No tenés acceso a esta división');
      }
    }

    return division;
  }

  async getRoster(
    actor: User,
    divisionId: string,
    positionId?: string | null,
  ): Promise<{ division: Division; athletes: DivisionRosterAthlete[] }> {
    const division = await this.assertCanAccessDivision(actor, divisionId);
    const athletes = await this.buildRoster(division.companyId, divisionId, positionId);
    return { division, athletes };
  }

  async getAnalytics(
    actor: User,
    divisionId: string,
    options: { groupBy?: 'division' | 'position'; positionId?: string | null } = {},
  ): Promise<DivisionAnalyticsResponse> {
    const division = await this.assertCanAccessDivision(actor, divisionId);
    const groupBy = options.groupBy ?? 'division';
    const positionFilter =
      options.positionId === undefined || options.positionId === ''
        ? null
        : options.positionId;

    const allAthletes = await this.buildRoster(division.companyId, divisionId, null);
    const filteredAthletes = positionFilter
      ? allAthletes.filter((a) =>
          positionFilter === 'none'
            ? !a.positionId
            : a.positionId === positionFilter,
        )
      : allAthletes;

    const overview = this.summarizeAthletes(filteredAthletes);
    const byPosition = this.groupByPosition(allAthletes);

    return {
      divisionId: division.id,
      divisionName: division.name,
      groupBy,
      positionId: positionFilter,
      overview,
      byPosition,
      athletes: filteredAthletes,
    };
  }

  async getCoachDashboard(
    actor: User,
    divisionId: string,
    options: { positionId?: string | null } = {},
  ): Promise<CoachDashboardResponse> {
    const division = await this.assertCanAccessDivision(actor, divisionId);
    const positionFilter =
      options.positionId === undefined || options.positionId === ''
        ? null
        : options.positionId;

    const allAthletes = await this.buildRoster(division.companyId, divisionId, null);
    const athletes = positionFilter
      ? allAthletes.filter((a) =>
          positionFilter === 'none' ? !a.positionId : a.positionId === positionFilter,
        )
      : allAthletes;

    const userIds = athletes.map((a) => a.userId);
    const metricRows = await this.loadCoachDashboardMetricRows(userIds);

    return {
      divisionId: division.id,
      divisionName: division.name,
      positionId: positionFilter,
      athletes,
      metricRows,
    };
  }

  private async loadCoachDashboardMetricRows(
    userIds: string[],
  ): Promise<CoachDashboardMetricRow[]> {
    if (userIds.length === 0) return [];

    const evals = await this.physicalEvalRepository.find({
      where: { user: { id: In(userIds) } },
      relations: ['tests', 'user'],
      order: { evaluationDate: 'ASC', createdAt: 'ASC' },
    });

    const rows: CoachDashboardMetricRow[] = [];
    for (const ev of evals) {
      const uid = ev.user?.id;
      if (!uid) continue;
      if (isStpLegacyOnlyPhysicalEvaluation(ev)) continue;

      const metrics = projectCoachDashboardMetrics(
        ev.derivedMetrics as Record<string, unknown> | null,
        ev.structuredAnalysis as Record<string, unknown> | null,
      );
      if (!hasAnyProjectedMetric(metrics)) continue;

      const d =
        ev.evaluationDate instanceof Date
          ? ev.evaluationDate
          : new Date(ev.evaluationDate);

      rows.push({
        userId: uid,
        evaluationId: ev.id,
        evaluationDate: d.toISOString().slice(0, 10),
        metrics,
      });
    }

    return rows;
  }

  private async buildRoster(
    companyId: string,
    divisionId: string,
    positionId?: string | null,
  ): Promise<DivisionRosterAthlete[]> {
    const qb = this.invitationRepository
      .createQueryBuilder('inv')
      .innerJoinAndSelect('inv.user', 'user')
      .leftJoinAndSelect('inv.position', 'position')
      .where('inv.companyId = :cid', { cid: companyId })
      .andWhere('inv.division_id = :did', { did: divisionId })
      .andWhere('inv.status = :status', { status: InvitationStatus.APPROVED });

    if (positionId && positionId !== 'none') {
      qb.andWhere('inv.position_id = :pid', { pid: positionId });
    }
    if (positionId === 'none') {
      qb.andWhere('inv.position_id IS NULL');
    }

    const invitations = await qb.orderBy('user.lastName', 'ASC').addOrderBy('user.name', 'ASC').getMany();
    const rosterInvitations = invitations.filter((inv) => !inv.user?.evaluationPortalOnly);
    const userIds = rosterInvitations.map((inv) => inv.user!.id);
    if (userIds.length === 0) return [];

    const [physicalByUser, sessionsByUser] = await Promise.all([
      this.loadPhysicalEvalSummaries(userIds),
      this.loadSessionStats(userIds),
    ]);

    return rosterInvitations.map((inv) => {
      const user = inv.user!;
      const uid = user.id;
      const physical = physicalByUser.get(uid);
      const sessions = sessionsByUser.get(uid) ?? { total: 0, completed: 0 };

      const adherencePct =
        sessions.total > 0
          ? Math.round((sessions.completed / sessions.total) * 100)
          : null;

      const recentEvals = physical?.recentEvals ?? [];
      const last = recentEvals[0] ?? null;

      return {
        userId: uid,
        name: user.name ?? '',
        lastName: user.lastName ?? '',
        email: user.email ?? '',
        positionId: inv.positionId ?? inv.position?.id ?? null,
        positionName: inv.position?.name ?? null,
        stpLevel: user.stpLevel ?? null,
        athleteScore: user.athleteScore ?? null,
        lastPhysicalEvalDate: last?.date ?? null,
        lastPhysicalScore: last?.score ?? null,
        evaluationCount: physical?.evaluationCount ?? 0,
        daysSinceLastEval: last
          ? this.daysBetweenUtc(last.date, new Date())
          : null,
        recentEvals,
        velocityStatus: physical?.velocityStatus ?? null,
        accelerationStatus: physical?.accelerationStatus ?? null,
        strengthStatus: physical?.strengthStatus ?? null,
        cmjStatus: physical?.cmjStatus ?? null,
        sessionsTotal: sessions.total,
        sessionsCompleted: sessions.completed,
        adherencePct,
      };
    });
  }

  private daysBetweenUtc(isoDate: string, now: Date): number {
    const start = new Date(`${isoDate}T00:00:00.000Z`);
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.max(0, Math.floor((end - start.getTime()) / (1000 * 60 * 60 * 24)));
  }

  private async loadPhysicalEvalSummaries(
    userIds: string[],
  ): Promise<
    Map<
      string,
      {
        evaluationCount: number;
        recentEvals: DivisionRosterRecentEval[];
        velocityStatus: RosterTrafficStatus | null;
        accelerationStatus: RosterTrafficStatus | null;
        strengthStatus: RosterTrafficStatus | null;
        cmjStatus: RosterTrafficStatus | null;
      }
    >
  > {
    const evals = await this.physicalEvalRepository.find({
      where: { user: { id: In(userIds) } },
      relations: ['tests', 'user'],
      order: { evaluationDate: 'DESC', createdAt: 'DESC' },
    });

    const map = new Map<
      string,
      {
        evaluationCount: number;
        recentEvals: DivisionRosterRecentEval[];
        velocityStatus: RosterTrafficStatus | null;
        accelerationStatus: RosterTrafficStatus | null;
        strengthStatus: RosterTrafficStatus | null;
        cmjStatus: RosterTrafficStatus | null;
      }
    >();

    for (const ev of evals) {
      const uid = ev.user?.id;
      if (!uid) continue;
      if (isStpLegacyOnlyPhysicalEvaluation(ev)) continue;

      const d =
        ev.evaluationDate instanceof Date
          ? ev.evaluationDate
          : new Date(ev.evaluationDate);
      const entry: DivisionRosterRecentEval = {
        date: d.toISOString().slice(0, 10),
        device: ev.device ?? null,
        score: ev.summaryScore ?? null,
      };

      const cur = map.get(uid) ?? {
        evaluationCount: 0,
        recentEvals: [],
        velocityStatus: null,
        accelerationStatus: null,
        strengthStatus: null,
        cmjStatus: null,
      };
      cur.evaluationCount += 1;
      if (cur.recentEvals.length < ROSTER_RECENT_EVALS_LIMIT) {
        cur.recentEvals.push(entry);
      }

      // Más reciente primero: solo completar si aún no hay status.
      if (cur.velocityStatus == null) {
        cur.velocityStatus = extractVelocityStatus(ev);
      }
      if (cur.accelerationStatus == null) {
        cur.accelerationStatus = extractAccelerationStatus(ev);
      }
      if (cur.strengthStatus == null) {
        cur.strengthStatus = extractStrengthStatus(ev);
      }
      if (cur.cmjStatus == null) {
        cur.cmjStatus = extractCmjStatus(ev);
      }

      map.set(uid, cur);
    }

    return map;
  }

  private async loadSessionStats(
    userIds: string[],
  ): Promise<Map<string, { total: number; completed: number }>> {
    const sessions = await this.sessionRepository.find({
      where: { athleteId: In(userIds) },
      select: ['athleteId', 'athleteCompletionStatus'],
    });

    const map = new Map<string, { total: number; completed: number }>();
    for (const s of sessions) {
      const cur = map.get(s.athleteId) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (s.athleteCompletionStatus === 'completed') cur.completed += 1;
      map.set(s.athleteId, cur);
    }
    return map;
  }

  private summarizeAthletes(athletes: DivisionRosterAthlete[]): DivisionAnalyticsOverview {
    const athleteCount = athletes.length;
    const evaluatedPhysicalCount = athletes.filter((a) => a.lastPhysicalEvalDate).length;

    const stpScores = athletes
      .map((a) => a.athleteScore)
      .filter((v): v is number => v != null);
    const physicalScores = athletes
      .map((a) => a.lastPhysicalScore)
      .filter((v): v is number => v != null);
    const adherenceValues = athletes
      .map((a) => a.adherencePct)
      .filter((v): v is number => v != null);

    return {
      athleteCount,
      evaluatedPhysicalCount,
      avgStpScore: avg(stpScores),
      avgPhysicalScore: avg(physicalScores),
      avgAdherencePct: avg(adherenceValues),
    };
  }

  private groupByPosition(athletes: DivisionRosterAthlete[]): DivisionAnalyticsGroup[] {
    const buckets = new Map<string, DivisionRosterAthlete[]>();

    for (const a of athletes) {
      const key = a.positionId ?? '__none__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(a);
    }

    const groups: DivisionAnalyticsGroup[] = [];
    for (const [key, list] of buckets) {
      const summary = this.summarizeAthletes(list);
      groups.push({
        ...summary,
        positionId: key === '__none__' ? null : key,
        positionName: key === '__none__' ? 'Sin posición' : list[0]?.positionName ?? '—',
      });
    }

    groups.sort((a, b) => a.positionName.localeCompare(b.positionName, 'es'));
    return groups;
  }
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function asTrafficStatus(value: unknown): RosterTrafficStatus | null {
  if (value === 'GREEN' || value === 'YELLOW' || value === 'RED') return value;
  return null;
}

function statusFromClassificationSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  metricKeys: string[],
): RosterTrafficStatus | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const results = snapshot.results;
  if (!results || typeof results !== 'object') return null;
  const map = results as Record<string, { status?: unknown }>;
  for (const key of metricKeys) {
    const status = asTrafficStatus(map[key]?.status);
    if (status) return status;
  }
  return null;
}

function protocolOf(ev: { protocolCode?: string | null }): string | null {
  return ev.protocolCode ? String(ev.protocolCode) : null;
}

function extractVelocityStatus(ev: {
  protocolCode?: string | null;
  classificationSnapshot?: Record<string, unknown> | null;
}): RosterTrafficStatus | null {
  // Velocidad ← Sprint 30 m
  if (protocolOf(ev) !== 'sprint_30m') return null;
  return statusFromClassificationSnapshot(ev.classificationSnapshot, [
    'avgVelocityMps',
    'maxVelocityMps',
    'bestTimeSeconds',
    'totalTimeSeconds',
  ]);
}

function extractAccelerationStatus(ev: {
  protocolCode?: string | null;
  classificationSnapshot?: Record<string, unknown> | null;
}): RosterTrafficStatus | null {
  // Aceleración ← Sprint 10 m
  if (protocolOf(ev) !== 'sprint_10m') return null;
  return statusFromClassificationSnapshot(ev.classificationSnapshot, [
    'avgAccelerationMps2',
    'bestTimeSeconds',
    'avgVelocityMps',
    'totalTimeSeconds',
  ]);
}

const SQUAT_REL_HIGH = 1.35;
const SQUAT_REL_LOW = 1.0;

function isBigThreeEval(ev: {
  device?: string | null;
  protocolCode?: string | null;
}): boolean {
  const protocol = protocolOf(ev);
  if (protocol === 'big_three_manual') return true;
  return ev.device === 'manual' || ev.device === 'big_three_manual';
}

function extractStrengthStatus(ev: {
  device?: string | null;
  protocolCode?: string | null;
  derivedMetrics?: Record<string, number | null> | null;
}): RosterTrafficStatus | null {
  // Fuerza ← big three (manual)
  if (!isBigThreeEval(ev)) return null;

  const derived = ev.derivedMetrics;
  if (!derived || typeof derived !== 'object') return null;

  const relative =
    typeof derived.mean_relative_strength === 'number'
      ? derived.mean_relative_strength
      : typeof derived.squat_relative_strength === 'number'
        ? derived.squat_relative_strength
        : null;

  if (relative == null || !Number.isFinite(relative)) return null;
  if (relative >= SQUAT_REL_HIGH) return 'GREEN';
  if (relative >= SQUAT_REL_LOW) return 'YELLOW';
  return 'RED';
}

function extractCmjStatus(ev: {
  device?: string | null;
  classificationSnapshot?: Record<string, unknown> | null;
  structuredAnalysis?: Record<string, unknown> | null;
}): RosterTrafficStatus | null {
  if (ev.device !== 'force_platform') return null;

  const fromSnap = statusFromClassificationSnapshot(ev.classificationSnapshot, [
    'cmj_height',
    'force_to_body_weight_ratio',
    'cmj_propulsive_force',
  ]);
  if (fromSnap) return fromSnap;

  const structured = ev.structuredAnalysis;
  if (structured && typeof structured === 'object') {
    const level = structured.level;
    if (level === 'high') return 'GREEN';
    if (level === 'medium') return 'YELLOW';
    if (level === 'low') return 'RED';

    const categoryScores = structured.categoryScores;
    if (categoryScores && typeof categoryScores === 'object') {
      const global = (categoryScores as Record<string, unknown>).global;
      const potencia = (categoryScores as Record<string, unknown>).potencia;
      const score =
        typeof global === 'number'
          ? global
          : typeof potencia === 'number'
            ? potencia
            : null;
      if (score != null && Number.isFinite(score)) {
        if (score >= 3.6) return 'GREEN';
        if (score >= 2.2) return 'YELLOW';
        return 'RED';
      }
    }
  }

  return null;
}
