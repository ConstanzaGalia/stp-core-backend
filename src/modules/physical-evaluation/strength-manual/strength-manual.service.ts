import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhysicalEvaluation } from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from 'src/entities/physical-evaluation-test.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { CreateManualStrengthEvaluationDto } from '../dto/create-manual-strength-evaluation.dto';
import { PhysicalEvaluationService } from '../physical-evaluation.service';
import {
  buildDerivedMetrics,
  buildSummaryAnalysis,
  computeLift,
  isValidBodyWeightKg,
  liftMetricsPayload,
} from './strength-metrics.calculator';
import {
  MANUAL_STRENGTH_FORMULA_VERSION,
  MANUAL_STRENGTH_LIFTS,
  MANUAL_STRENGTH_PROTOCOL_CODE,
  type ManualStrengthLiftCode,
  type ManualStrengthLiftComputed,
  type ManualStrengthLiftInput,
  type ManualStrengthPreview,
} from './strength-manual.types';

function parseEvaluationDateOnly(iso: string): Date {
  const datePart = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) throw new BadRequestException('Fecha de evaluación inválida');
  return new Date(Date.UTC(y, m - 1, d));
}

@Injectable()
export class StrengthManualService {
  constructor(
    private readonly physicalEvaluations: PhysicalEvaluationService,
    @InjectRepository(PhysicalEvaluation)
    private readonly evaluationRepo: Repository<PhysicalEvaluation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async buildPreview(
    actor: User,
    dto: CreateManualStrengthEvaluationDto,
  ): Promise<ManualStrengthPreview> {
    const target = await this.physicalEvaluations.assertCanAccessAthlete(actor, dto.athleteId, true);
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Solo el staff puede registrar evaluaciones de fuerza');
    }

    const bodyWeightKg = target.peso;
    if (!isValidBodyWeightKg(bodyWeightKg)) {
      throw new BadRequestException(
        'La jugadora no tiene peso corporal válido en el perfil. Completá el peso biométrico antes de guardar esta evaluación.',
      );
    }

    const lifts = this.resolveLifts(dto, bodyWeightKg);
    if (!lifts.length) {
      throw new BadRequestException(
        'Debés completar al menos un básico (sentadilla, press banca o peso muerto).',
      );
    }

    const derivedMetrics = buildDerivedMetrics(lifts, bodyWeightKg);
    const completeness = Math.round((lifts.length / 3) * 100);
    const warnings: string[] = [];
    if (lifts.length < 3) {
      warnings.push(`Evaluación parcial: ${lifts.length}/3 básicos registrados.`);
    }

    return {
      athleteId: target.id,
      evaluationDate: dto.evaluationDate,
      protocolCode: MANUAL_STRENGTH_PROTOCOL_CODE,
      protocolLabel: 'Tres básicos (manual)',
      bodyWeightKg,
      bodyWeightSource: 'user_profile',
      lifts,
      derivedMetrics,
      completeness,
      summaryAnalysis: buildSummaryAnalysis(lifts, derivedMetrics),
      warnings,
    };
  }

  async create(actor: User, dto: CreateManualStrengthEvaluationDto): Promise<PhysicalEvaluation> {
    const preview = await this.buildPreview(actor, dto);
    const target = await this.userRepo.findOne({ where: { id: preview.athleteId } });
    if (!target) {
      throw new BadRequestException('Atleta no encontrado');
    }

    const evaluationDate = parseEvaluationDateOnly(preview.evaluationDate);

    const tests = preview.lifts.map((lift) => {
      const row = new PhysicalEvaluationTest();
      row.testName = lift.label;
      row.testType = lift.testType;
      row.metrics = liftMetricsPayload(lift);
      row.repetitions = [];
      row.aggregates = {
        estimated_1rm_kg: {
          best: lift.estimated1rmKg,
          mean: lift.estimated1rmKg,
          worst: lift.estimated1rmKg,
        },
        relative_strength: {
          best: lift.relativeStrength,
          mean: lift.relativeStrength,
          worst: lift.relativeStrength,
        },
      };
      row.warnings = [];
      return row;
    });

    const evaluation = this.evaluationRepo.create({
      user: target,
      evaluationDate,
      summaryScore: null,
      summaryAnalysis: preview.summaryAnalysis,
      structuredAnalysis: null,
      processingStatus: 'ready',
      warnings: preview.warnings,
      completeness: preview.completeness,
      device: 'manual',
      protocolCode: MANUAL_STRENGTH_PROTOCOL_CODE,
      attempt: null,
      derivedMetrics: { ...preview.derivedMetrics } as Record<string, number | null>,
      metadata: {
        sourceType: 'manual_strength',
        formula: MANUAL_STRENGTH_FORMULA_VERSION,
        bodyWeightKg: preview.bodyWeightKg,
        bodyWeightSource: preview.bodyWeightSource,
        liftsCompleted: preview.lifts.length,
      },
      files: [],
      tests,
    });

    const saved = await this.evaluationRepo.save(evaluation);
    return this.physicalEvaluations.findOneById(actor, target.id, saved.id);
  }

  private resolveLifts(
    dto: CreateManualStrengthEvaluationDto,
    bodyWeightKg: number,
  ): ManualStrengthLiftComputed[] {
    const result: ManualStrengthLiftComputed[] = [];
    for (const def of MANUAL_STRENGTH_LIFTS) {
      const raw = dto.lifts?.[def.code as ManualStrengthLiftCode];
      if (!raw) continue;
      const input: ManualStrengthLiftInput = {
        loadKg: Number(raw.loadKg),
        reps: Number(raw.reps),
        rir: Number(raw.rir),
      };
      if (!Number.isFinite(input.loadKg) || input.loadKg <= 0) {
        throw new BadRequestException(`Carga inválida en ${def.label}`);
      }
      if (!Number.isInteger(input.reps) || input.reps < 1 || input.reps > 12) {
        throw new BadRequestException(`Repeticiones inválidas en ${def.label} (1–12)`);
      }
      if (!Number.isInteger(input.rir) || input.rir < 0 || input.rir > 5) {
        throw new BadRequestException(`RIR inválido en ${def.label} (0–5)`);
      }
      result.push(computeLift(def.code, input, bodyWeightKg));
    }
    return result;
  }

  private isStaff(actor: User): boolean {
    return [
      UserRole.STP_ADMIN,
      UserRole.DIRECTOR,
      UserRole.TRAINER,
      UserRole.SUB_TRAINER,
      UserRole.SECRETARIA,
    ].includes(actor.role);
  }
}
