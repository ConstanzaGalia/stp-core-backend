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
  sessionsTotal: number;
  sessionsCompleted: number;
  adherencePct: number | null;
};

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
      this.loadLatestPhysicalEvals(userIds),
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

      return {
        userId: uid,
        name: user.name ?? '',
        lastName: user.lastName ?? '',
        email: user.email ?? '',
        positionId: inv.positionId ?? inv.position?.id ?? null,
        positionName: inv.position?.name ?? null,
        stpLevel: user.stpLevel ?? null,
        athleteScore: user.athleteScore ?? null,
        lastPhysicalEvalDate: physical?.date ?? null,
        lastPhysicalScore: physical?.score ?? null,
        sessionsTotal: sessions.total,
        sessionsCompleted: sessions.completed,
        adherencePct,
      };
    });
  }

  private async loadLatestPhysicalEvals(
    userIds: string[],
  ): Promise<Map<string, { date: string; score: number | null }>> {
    const evals = await this.physicalEvalRepository.find({
      where: { user: { id: In(userIds) } },
      relations: ['tests', 'user'],
      order: { evaluationDate: 'DESC', createdAt: 'DESC' },
    });

    const map = new Map<string, { date: string; score: number | null }>();
    for (const ev of evals) {
      const uid = ev.user?.id;
      if (!uid || map.has(uid)) continue;
      if (isStpLegacyOnlyPhysicalEvaluation(ev)) continue;
      const d =
        ev.evaluationDate instanceof Date
          ? ev.evaluationDate
          : new Date(ev.evaluationDate);
      map.set(uid, {
        date: d.toISOString().slice(0, 10),
        score: ev.summaryScore ?? null,
      });
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
