import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { PhysicalEvaluation } from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from 'src/entities/physical-evaluation-test.entity';
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
 * Política perfil (legacy STP): si la evaluación física produce `summaryScore` (0–100),
 * se actualiza `user.athleteScore` en escala ~0–5 como `summaryScore / 20` y `stp_level` con los mismos
 * umbrales que la evaluación STP de tres dimensiones, para mantener coherencia en el dashboard.
 */

function parseEvaluationDateOnly(isoOrYmd: string): Date {
  const ymd = isoOrYmd.includes('T') ? isoOrYmd.split('T')[0] : isoOrYmd;
  const [y, m, d] = ymd.split('-').map((n) => Number(n));
  if (!y || !m || !d) throw new BadRequestException('evaluationDate inválida');
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function stpLevelFromAthleteScore(score: number): number {
  if (score < 2) return 1;
  if (score < 3) return 2;
  if (score < 4) return 3;
  if (score <= 4.5) return 4;
  return 5;
}

/** Convierte score de evaluación física (0–100) al rango legacy de perfil (~0–5). */
function physicalSummaryToAthleteScore(summary: number): number {
  const scaled = summary / 20;
  return +Math.min(5, Math.max(0, scaled)).toFixed(2);
}

@Injectable()
export class PhysicalEvaluationService {
  constructor(
    @InjectRepository(PhysicalEvaluation)
    private readonly evaluationRepo: Repository<PhysicalEvaluation>,
    @InjectRepository(PhysicalEvaluationTest)
    private readonly testRepo: Repository<PhysicalEvaluationTest>,
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

  /**
   * Atleta: solo lectura sobre sí mismo.
   * Staff: lectura/escritura si comparte centro con el atleta (STP_ADMIN sin restricción de centro).
   */
  async assertCanAccessAthlete(actor: User, athleteUserId: string, write: boolean): Promise<User> {
    const target = await this.userRepo.findOne({ where: { id: athleteUserId } });
    if (!target) throw new NotFoundException('Atleta no encontrado');
    if (target.role !== UserRole.ATHLETE) {
      throw new BadRequestException('El usuario indicado no es un atleta');
    }

    if (actor.role === UserRole.ATHLETE) {
      if (actor.id !== athleteUserId) throw new ForbiddenException('No puedes ver evaluaciones de otro atleta');
      if (write) throw new ForbiddenException('Los atletas no pueden crear evaluaciones físicas');
      return target;
    }

    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Sin permiso');
    }

    if (actor.role === UserRole.STP_ADMIN) {
      return target;
    }

    const staffCompanies = await this.companyService.findCompaniesByUser(actor.id);
    const staffIds = new Set(staffCompanies.map((c) => c.id));
    const subs = await this.athletesService.getMySubscribedCenters(athleteUserId);
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
    payload: { testName: string; testType: string; metrics: Record<string, unknown> },
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
    });
    await this.testRepo.save(row);
  }

  /** Recalcula resumen global y perfil atleta a partir de todos los tests de la evaluación. */
  async recomputeEvaluationSummary(evaluationId: string): Promise<void> {
    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
      relations: ['tests', 'user'],
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

    const athlete = ev.user;
    if (computed.summaryScore != null && Number.isFinite(computed.summaryScore)) {
      athlete.athleteScore = physicalSummaryToAthleteScore(computed.summaryScore);
      athlete.stpLevel = stpLevelFromAthleteScore(athlete.athleteScore);
      await this.userRepo.save(athlete);
    }
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

    if (summaryScore != null && Number.isFinite(summaryScore)) {
      const athleteScore = physicalSummaryToAthleteScore(summaryScore);
      target.athleteScore = athleteScore;
      target.stpLevel = stpLevelFromAthleteScore(athleteScore);
      await this.userRepo.save(target);
    }

    return this.findOneById(actor, athleteUserId, saved.id);
  }

  async listForAthlete(actor: User, athleteUserId: string): Promise<PhysicalEvaluation[]> {
    await this.assertCanAccessAthlete(actor, athleteUserId, false);
    return this.evaluationRepo.find({
      where: { user: { id: athleteUserId } },
      relations: ['tests'],
      order: { evaluationDate: 'DESC', createdAt: 'DESC' },
    });
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
}
