import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { PhysicalEvaluation, PhysicalEvaluationFileMeta } from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from 'src/entities/physical-evaluation-test.entity';
import { AthleteEvaluation } from 'src/entities/athlete-evaluation.entity';
import { UserRole } from 'src/common/enums/enums';
import { CompanyService } from '../company/company.service';
import { AthletesService } from '../athletes/athletes.service';
import { PhysicalEvaluationAnalysisService } from './physical-evaluation-analysis.service';
import { CreatePhysicalEvaluationDto } from './dto/create-physical-evaluation.dto';
import type { PhysicalTestInput } from './physical-evaluation.types';

const STAFF_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

const MAX_METRICS_JSON_BYTES = 48_000;

/**
 * Perfil atleta (`user.athleteScore` ~0–5, `user.stpLevel`): solo refleja la clasificación STP
 * (tres dimensiones en tabla `athlete_evaluation`). Las evaluaciones físicas guardan `summaryScore`
 * y análisis en `physical_evaluation` pero no modifican el perfil.
 *
 * `syncAthleteScoreFromEvaluationSources` alinea el perfil con la última fila de `athlete_evaluation`
 * (p. ej. tras borrar una física o una clasificación STP).
 */

function parseEvaluationDateOnly(isoOrYmd: string): Date {
  const ymd = isoOrYmd.includes('T') ? isoOrYmd.split('T')[0] : isoOrYmd;
  const [y, m, d] = ymd.split('-').map((n) => Number(n));
  if (!y || !m || !d) throw new BadRequestException('evaluationDate inválida');
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Filas importadas/migradas desde `athlete_evaluation` (test `stp_legacy` únicamente).
 * No deben listarse como evaluaciones físicas ni usarse como fuente de score físico.
 */
export function isStpLegacyOnlyPhysicalEvaluation(ev: { tests?: PhysicalEvaluationTest[] }): boolean {
  const tests = ev.tests ?? [];
  if (tests.length === 0) return false;
  return tests.every((t) => String(t.testType).toLowerCase() === 'stp_legacy');
}

@Injectable()
export class PhysicalEvaluationService {
  constructor(
    @InjectRepository(PhysicalEvaluation)
    private readonly evaluationRepo: Repository<PhysicalEvaluation>,
    @InjectRepository(PhysicalEvaluationTest)
    private readonly testRepo: Repository<PhysicalEvaluationTest>,
    @InjectRepository(AthleteEvaluation)
    private readonly legacyEvalRepo: Repository<AthleteEvaluation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly analysisService: PhysicalEvaluationAnalysisService,
    private readonly companyService: CompanyService,
    private readonly athletesService: AthletesService,
  ) {}

  private assertMetricsPayloadSize(tests: { metrics: Record<string, unknown> }[]) {
    for (const t of tests) {
      const s = JSON.stringify(t.metrics ?? {});
      if (Buffer.byteLength(s, 'utf8') > MAX_METRICS_JSON_BYTES) {
        throw new BadRequestException('Métricas demasiado grandes en un test');
      }
    }
  }

  assertSingleMetricsSize(metrics: Record<string, unknown>) {
    const s = JSON.stringify(metrics ?? {});
    if (Buffer.byteLength(s, 'utf8') > MAX_METRICS_JSON_BYTES) {
      throw new BadRequestException('Métricas demasiado grandes');
    }
  }

  private isStaff(user: User): boolean {
    return STAFF_ROLES.includes(user.role);
  }

  private async assertStaffCanAccessCompany(actor: User, companyId: string): Promise<void> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Sin permiso');
    }
    if (actor.role === UserRole.STP_ADMIN) {
      return;
    }
    const staffCompanies = await this.companyService.findCompaniesByUser(actor.id);
    if (!staffCompanies.some((c) => c.id === companyId)) {
      throw new ForbiddenException('No perteneces a este centro');
    }
  }

  /**
   * Listado para el hub staff: miembros del centro (incl. portal-only) con al menos una evaluación física "útil".
   */
  async listHubAthletesWithPhysicalEvaluations(
    actor: User,
    companyId: string,
  ): Promise<
    Array<{
      userId: string;
      name: string;
      lastName: string;
      primarySport: string | null;
      evaluationPortalOnly: boolean;
      evaluationCount: number;
      lastEvaluationDate: string;
    }>
  > {
    await this.assertStaffCanAccessCompany(actor, companyId);
    const invitations = await this.athletesService.getCompanyAthletesIncludingPortal(companyId);
    const userIds = invitations.map((i) => i.user?.id).filter(Boolean) as string[];
    if (!userIds.length) {
      return [];
    }
    const evals = await this.evaluationRepo.find({
      where: { user: { id: In(userIds) } },
      relations: ['tests', 'user'],
      order: { evaluationDate: 'DESC', createdAt: 'DESC' },
    });
    const byUser = new Map<string, typeof evals>();
    for (const e of evals) {
      const uid = e.user?.id;
      if (!uid) continue;
      if (!byUser.has(uid)) {
        byUser.set(uid, []);
      }
      byUser.get(uid)!.push(e);
    }
    const result: Array<{
      userId: string;
      name: string;
      lastName: string;
      primarySport: string | null;
      evaluationPortalOnly: boolean;
      evaluationCount: number;
      lastEvaluationDate: string;
    }> = [];
    for (const inv of invitations) {
      const uid = inv.user?.id;
      if (!uid) continue;
      const list = byUser.get(uid) ?? [];
      const meaningful = list.filter((ev) => !isStpLegacyOnlyPhysicalEvaluation(ev));
      if (meaningful.length === 0) continue;
      let maxTime = 0;
      for (const ev of meaningful) {
        const d = ev.evaluationDate instanceof Date ? ev.evaluationDate : new Date(ev.evaluationDate);
        const t = d.getTime();
        if (t > maxTime) maxTime = t;
      }
      const last = new Date(maxTime);
      result.push({
        userId: uid,
        name: inv.user!.name,
        lastName: inv.user!.lastName,
        primarySport: inv.user!.primarySport ?? null,
        evaluationPortalOnly: inv.user!.evaluationPortalOnly === true,
        evaluationCount: meaningful.length,
        lastEvaluationDate: last.toISOString().slice(0, 10),
      });
    }
    result.sort((a, b) => b.lastEvaluationDate.localeCompare(a.lastEvaluationDate));
    return result;
  }

  /**
   * Atleta: solo lectura sobre sí mismo.
   * Staff: lectura/escritura si comparte centro con el atleta (STP_ADMIN sin restricción de centro).
   */
  async assertCanAccessAthlete(actor: User, athleteUserId: string, write: boolean): Promise<User> {
    // Atletas: la autorización es local (sin DB para el chequeo de permisos)
    if (actor.role === UserRole.ATHLETE) {
      if (actor.id !== athleteUserId) throw new ForbiddenException('No puedes ver evaluaciones de otro atleta');
      if (write) throw new ForbiddenException('Los atletas no pueden crear evaluaciones físicas');
      const target = await this.userRepo.findOne({ where: { id: athleteUserId } });
      if (!target) throw new NotFoundException('Atleta no encontrado');
      if (target.role !== UserRole.ATHLETE) throw new BadRequestException('El usuario indicado no es un atleta');
      return target;
    }

    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Sin permiso');
    }

    // STP_ADMIN: solo necesita verificar que el usuario exista y sea atleta
    if (actor.role === UserRole.STP_ADMIN) {
      const target = await this.userRepo.findOne({ where: { id: athleteUserId } });
      if (!target) throw new NotFoundException('Atleta no encontrado');
      if (target.role !== UserRole.ATHLETE) throw new BadRequestException('El usuario indicado no es un atleta');
      return target;
    }

    // Staff normal: verificar atleta y empresas compartidas en paralelo (1 ronda vs 4 secuenciales)
    const [target, staffCompanies, subs] = await Promise.all([
      this.userRepo.findOne({ where: { id: athleteUserId } }),
      this.companyService.findCompaniesByUser(actor.id),
      this.athletesService.getMySubscribedCenters(athleteUserId),
    ]);

    if (!target) throw new NotFoundException('Atleta no encontrado');
    if (target.role !== UserRole.ATHLETE) throw new BadRequestException('El usuario indicado no es un atleta');

    const staffIds = new Set(staffCompanies.map((c) => c.id));
    const athleteCompanyIds = subs.map((inv) => inv.company?.id).filter(Boolean) as string[];
    const shares = athleteCompanyIds.some((id) => staffIds.has(id));
    if (!shares) {
      throw new ForbiddenException('No tienes acceso a evaluaciones de este atleta en tu centro');
    }
    return target;
  }

  /** Evaluación vacía para completar luego con `POST /evaluaciones/:id/upload`. */
  async createEmptyEvaluation(actor: User, athleteUserId: string, evaluationDateIso: string): Promise<PhysicalEvaluation> {
    const target = await this.assertCanAccessAthlete(actor, athleteUserId, true);
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Solo el staff puede crear evaluaciones');
    }
    const evaluationDate = parseEvaluationDateOnly(evaluationDateIso);
    const evaluation = this.evaluationRepo.create({
      user: target,
      evaluationDate,
      summaryScore: null,
      summaryAnalysis: null,
      structuredAnalysis: null,
      tests: [],
    });
    const saved = await this.evaluationRepo.save(evaluation);
    return this.findOneById(actor, athleteUserId, saved.id);
  }

  async findEvaluationForActor(actor: User, evaluationId: string, write: boolean): Promise<PhysicalEvaluation> {
    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
      relations: ['user'],
    });
    if (!ev?.user?.id) throw new NotFoundException('Evaluación no encontrada');
    await this.assertCanAccessAthlete(actor, ev.user.id, write);
    return ev;
  }

  /** Inserta un test sin recalcular el resumen (el caller llama `recomputeEvaluationSummary`). */
  async appendTestFromUpload(
    actor: User,
    evaluationId: string,
    payload: {
      testName: string;
      testType: string;
      metrics: Record<string, unknown>;
      repetitions?: Array<Record<string, unknown>>;
      sourceFileId?: string | null;
    },
  ): Promise<void> {
    await this.findEvaluationForActor(actor, evaluationId, true);
    this.assertSingleMetricsSize(payload.metrics);
    const evaluation = await this.evaluationRepo.findOne({ where: { id: evaluationId } });
    if (!evaluation) throw new NotFoundException('Evaluación no encontrada');
    const row = this.testRepo.create({
      evaluation,
      testName: payload.testName,
      testType: payload.testType,
      metrics: payload.metrics,
      repetitions: payload.repetitions?.length ? payload.repetitions : [],
      sourceFileId: payload.sourceFileId ?? null,
    });
    await this.testRepo.save(row);
  }

  /** Agrega entradas al arreglo JSON `files` de la evaluación (p. ej. metadata de Supabase). */
  async appendEvaluationFiles(evaluationId: string, newFiles: PhysicalEvaluationFileMeta[]): Promise<void> {
    if (!newFiles.length) return;
    const evaluation = await this.evaluationRepo.findOne({ where: { id: evaluationId } });
    if (!evaluation) throw new NotFoundException('Evaluación no encontrada');
    const existing = Array.isArray(evaluation.files) ? evaluation.files : [];
    evaluation.files = [...existing, ...newFiles];
    await this.evaluationRepo.save(evaluation);
  }

  /** Recalcula resumen global de la evaluación física (no altera el perfil STP del atleta). */
  async recomputeEvaluationSummary(evaluationId: string): Promise<void> {
    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
      relations: ['tests'],
    });
    if (!ev) throw new NotFoundException('Evaluación no encontrada');

    if (!ev.tests?.length) {
      ev.summaryScore = null;
      ev.summaryAnalysis = 'Sin tests en esta evaluación. Suba archivos para generar métricas.';
      await this.evaluationRepo.save(ev);
      return;
    }

    const inputs: PhysicalTestInput[] = ev.tests.map((t) => ({
      testName: t.testName,
      testType: t.testType,
      metrics: t.metrics ?? {},
    }));
    const computed = this.analysisService.analyze(inputs);
    ev.summaryScore = computed.summaryScore;
    ev.summaryAnalysis = computed.summaryAnalysis;
    ev.structuredAnalysis = computed.structuredAnalysis as unknown as Record<string, unknown>;
    await this.evaluationRepo.save(ev);
  }

  async create(actor: User, athleteUserId: string, dto: CreatePhysicalEvaluationDto): Promise<PhysicalEvaluation> {
    const target = await this.assertCanAccessAthlete(actor, athleteUserId, true);
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Solo el staff puede registrar evaluaciones');
    }

    if (!dto.tests?.length) {
      throw new BadRequestException('Debe incluir al menos un test');
    }

    this.assertMetricsPayloadSize(dto.tests);

    const inputs: PhysicalTestInput[] = dto.tests.map((t) => ({
      testName: t.testName,
      testType: t.testType,
      metrics: t.metrics ?? {},
    }));

    const computed = this.analysisService.analyze(inputs);

    const staffOverride = this.isStaff(actor);
    let summaryScore = computed.summaryScore;
    let summaryAnalysis = computed.summaryAnalysis;

    if (staffOverride && dto.summaryScoreOverride != null) {
      summaryScore = dto.summaryScoreOverride;
    }
    if (staffOverride && dto.summaryAnalysisOverride != null && dto.summaryAnalysisOverride.trim() !== '') {
      summaryAnalysis = dto.summaryAnalysisOverride.trim();
    }

    const evaluationDate = parseEvaluationDateOnly(dto.evaluationDate);

    const tests = dto.tests.map((t) => {
      const row = new PhysicalEvaluationTest();
      row.testName = t.testName;
      row.testType = t.testType;
      row.metrics = t.metrics ?? {};
      return row;
    });

    const evaluation = this.evaluationRepo.create({
      user: target,
      evaluationDate,
      summaryScore,
      summaryAnalysis,
      structuredAnalysis: computed.structuredAnalysis as unknown as Record<string, unknown>,
      tests,
    });

    const saved = await this.evaluationRepo.save(evaluation);

    return this.findOneById(actor, athleteUserId, saved.id);
  }

  async listForAthlete(
    actor: User,
    athleteUserId: string,
    options?: { excludeStpLegacyOnly?: boolean },
  ): Promise<PhysicalEvaluation[]> {
    await this.assertCanAccessAthlete(actor, athleteUserId, false);
    const list = await this.evaluationRepo.find({
      where: { user: { id: athleteUserId } },
      relations: ['tests'],
      order: { evaluationDate: 'DESC', createdAt: 'DESC' },
    });
    if (options?.excludeStpLegacyOnly) {
      return list.filter((ev) => !isStpLegacyOnlyPhysicalEvaluation(ev));
    }
    return list;
  }

  async findOneById(actor: User, athleteUserId: string, evaluationId: string): Promise<PhysicalEvaluation> {
    await this.assertCanAccessAthlete(actor, athleteUserId, false);
    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId, user: { id: athleteUserId } },
      relations: ['tests'],
    });
    if (!ev) throw new NotFoundException('Evaluación no encontrada');
    return ev;
  }

  /**
   * Alinea `athleteScore` / `stpLevel` solo con la última clasificación STP (`athlete_evaluation`).
   */
  async syncAthleteScoreFromEvaluationSources(athleteUserId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: athleteUserId } });
    if (!user) return;

    const latestStp = await this.legacyEvalRepo.findOne({
      where: { user: { id: athleteUserId } },
      order: { createdAt: 'DESC' },
    });

    if (latestStp) {
      user.athleteScore = latestStp.scoreTotal;
      user.stpLevel = latestStp.stpLevel;
      await this.userRepo.save(user);
      return;
    }

    user.athleteScore = null;
    user.stpLevel = null;
    await this.userRepo.save(user);
  }

  async remove(actor: User, athleteUserId: string, evaluationId: string): Promise<void> {
    await this.assertCanAccessAthlete(actor, athleteUserId, true);
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Solo el staff puede eliminar evaluaciones físicas');
    }

    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId, user: { id: athleteUserId } },
    });
    if (!ev) throw new NotFoundException('Evaluación no encontrada');

    await this.evaluationRepo.remove(ev);
    await this.syncAthleteScoreFromEvaluationSources(athleteUserId);
  }
}
