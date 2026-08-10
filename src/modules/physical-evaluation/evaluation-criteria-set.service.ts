import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EvaluationCriteriaSet,
  type CriteriaThresholds,
} from 'src/entities/evaluation-criteria-set.entity';
import { PhysicalEvaluation } from 'src/entities/physical-evaluation.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import {
  CreateEvaluationCriteriaSetDto,
  UpdateEvaluationCriteriaSetDto,
} from './dto/evaluation-criteria-set.dto';

const MANAGE_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
];

const HOCKEY_MAYOR_THRESHOLDS: CriteriaThresholds = {
  altura_de_salto: { greenMin: 35, yellowMin: 25, unit: 'cm', higherIsBetter: true },
  rsi: { greenMin: 1.2, yellowMin: 0.9, higherIsBetter: true },
  eficiencia: { greenMin: 0.7, yellowMin: 0.6, higherIsBetter: true },
  asimetria_frenado: { greenMax: 10, yellowMax: 15, unit: '%', higherIsBetter: false, useAbs: true },
  asimetria_propulsiva: { greenMax: 10, yellowMax: 15, unit: '%', higherIsBetter: false, useAbs: true },
  asimetria_aterrizaje: { greenMax: 10, yellowMax: 15, unit: '%', higherIsBetter: false, useAbs: true },
};

const HOCKEY_MAYOR_FEMALE_SPRINT_30M_THRESHOLDS: CriteriaThresholds = {
  bestTimeSeconds: {
    greenMax: 4.7,
    yellowMax: 4.95,
    unit: 's',
    direction: 'LOWER_IS_BETTER',
    higherIsBetter: false,
    messages: {
      green: [
        'Excelente rendimiento de aceleración en 30 metros.',
        'La marca evidencia una capacidad de aceleración destacada.',
        'El tiempo alcanzado representa una fortaleza clara en velocidad.',
      ],
      yellow: [
        'Buen rendimiento de velocidad, con margen para seguir reduciendo la marca.',
        'La aceleración es adecuada y todavía puede evolucionar con trabajo específico.',
        'El tiempo se encuentra en un nivel competitivo, con espacio de mejora.',
      ],
      red: [
        'El desarrollo de la aceleración será un objetivo prioritario.',
        'Conviene orientar el próximo período a mejorar la producción de velocidad.',
        'La marca muestra una oportunidad concreta para desarrollar la aceleración.',
      ],
    },
  },
};

const HOCKEY_MAYOR_FEMALE_SPRINT_10M_THRESHOLDS: CriteriaThresholds = {
  bestTimeSeconds: {
    greenMax: 2.0,
    yellowMax: 2.12,
    unit: 's',
    direction: 'LOWER_IS_BETTER',
    higherIsBetter: false,
    messages: {
      green: [
        'Excelente rendimiento de aceleración en 10 metros.',
        'La marca evidencia una salida y primeros metros destacados.',
        'El tiempo alcanzado representa una fortaleza clara en aceleración corta.',
      ],
      yellow: [
        'Buen rendimiento en 10 m, con margen para seguir reduciendo la marca.',
        'La aceleración inicial es adecuada y todavía puede evolucionar.',
        'El tiempo se encuentra en un nivel competitivo, con espacio de mejora.',
      ],
      red: [
        'El desarrollo de la aceleración en 10 m será un objetivo prioritario.',
        'Conviene orientar el próximo período a mejorar arranques y primeros metros.',
        'La marca muestra una oportunidad concreta para desarrollar la aceleración corta.',
      ],
    },
  },
  avgVelocityMps: {
    greenMin: 5.0,
    yellowMin: 4.72,
    unit: 'm/s',
    direction: 'HIGHER_IS_BETTER',
    higherIsBetter: true,
  },
  avgAccelerationMps2: {
    greenMin: 5.0,
    yellowMin: 4.45,
    unit: 'm/s²',
    direction: 'HIGHER_IS_BETTER',
    higherIsBetter: true,
  },
};

@Injectable()
export class EvaluationCriteriaSetService implements OnModuleInit {
  private readonly logger = new Logger(EvaluationCriteriaSetService.name);

  constructor(
    @InjectRepository(EvaluationCriteriaSet)
    private readonly repo: Repository<EvaluationCriteriaSet>,
  ) {}

  async onModuleInit() {
    await this.ensureBootstrapSeed();
  }

  async ensureBootstrapSeed(): Promise<void> {
    try {
      const seeds: Array<Partial<EvaluationCriteriaSet>> = [
        {
          code: 'hockey_mayor_seleccion',
          name: 'Hockey Mayor – Selección',
          sport: 'hockey',
          ageGroup: 'mayor',
          sex: null,
          testType: 'cmj',
          protocolCode: null,
          version: '1.0',
          source: 'manual',
          description: 'Criterios fijos para devoluciones consistentes en selección hockey mayor.',
          thresholds: HOCKEY_MAYOR_THRESHOLDS,
          isActive: true,
        },
        {
          code: 'hockey_mayor_female_sprint_30m_v1',
          name: 'Hockey Mayor Damas · Sprint 30 m · v1.0',
          sport: 'hockey',
          ageGroup: 'mayor',
          sex: 'female',
          testType: 'photocells',
          protocolCode: 'sprint_30m',
          version: '1.0',
          source: 'manual',
          description: 'Referencia práctica inicial para Sprint 30 m.',
          thresholds: HOCKEY_MAYOR_FEMALE_SPRINT_30M_THRESHOLDS,
          isActive: true,
        },
        {
          code: 'hockey_mayor_female_sprint_10m_v1',
          name: 'Hockey Mayor Damas · Sprint 10 m · v1.0',
          sport: 'hockey',
          ageGroup: 'mayor',
          sex: 'female',
          testType: 'photocells',
          protocolCode: 'sprint_10m',
          version: '1.0',
          source: 'manual',
          description: 'Referencia práctica inicial para Sprint 10 m.',
          thresholds: HOCKEY_MAYOR_FEMALE_SPRINT_10M_THRESHOLDS,
          isActive: true,
        },
      ];

      for (const seed of seeds) {
        const existing = await this.repo.findOne({ where: { code: seed.code! } });
        if (!existing) await this.repo.save(this.repo.create(seed));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `No se pudo sembrar evaluation_criteria_set (${msg}). ` +
          `Ejecutá sql/create-evaluation-criteria-sets.sql y reiniciá el backend.`,
      );
    }
  }

  private assertCanManage(actor: User) {
    if (!MANAGE_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        'Solo director, entrenador o STP admin pueden gestionar criterios',
      );
    }
  }

  async list(testType?: string, activeOnly = true): Promise<EvaluationCriteriaSet[]> {
    const where: Record<string, unknown> = {};
    if (testType) where.testType = testType;
    if (activeOnly) where.isActive = true;
    return this.repo.find({
      where,
      order: { sport: 'ASC', ageGroup: 'ASC', name: 'ASC' },
    });
  }

  async findById(id: string): Promise<EvaluationCriteriaSet> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Criterio no encontrado');
    return row;
  }

  async create(actor: User, dto: CreateEvaluationCriteriaSetDto): Promise<EvaluationCriteriaSet> {
    this.assertCanManage(actor);
    const code = dto.code.trim().toLowerCase().replace(/\s+/g, '_');
    if (!code) throw new BadRequestException('code requerido');
    const existing = await this.repo.findOne({ where: { code } });
    if (existing) throw new BadRequestException(`Ya existe un criterio con code=${code}`);
    return this.repo.save(
      this.repo.create({
        code,
        name: dto.name.trim(),
        sport: dto.sport?.trim() || null,
        ageGroup: dto.ageGroup?.trim() || null,
        sex: dto.sex?.trim().toLowerCase() || null,
        testType: (dto.testType || 'cmj').trim(),
        protocolCode: dto.protocolCode?.trim() || null,
        version: dto.version?.trim() || '1.0',
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        source: dto.source ?? 'manual',
        sampleSize: dto.sampleSize ?? null,
        description: dto.description?.trim() || null,
        thresholds: (dto.thresholds || {}) as CriteriaThresholds,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async update(
    actor: User,
    id: string,
    dto: UpdateEvaluationCriteriaSetDto,
  ): Promise<EvaluationCriteriaSet> {
    this.assertCanManage(actor);
    const row = await this.findById(id);
    const normalizeDate = (value: Date | string | null | undefined) =>
      value ? new Date(value).toISOString().slice(0, 10) : null;
    const changesReference =
      (dto.sport !== undefined && (dto.sport?.trim() || null) !== row.sport) ||
      (dto.ageGroup !== undefined && (dto.ageGroup?.trim() || null) !== row.ageGroup) ||
      (dto.sex !== undefined && (dto.sex?.trim().toLowerCase() || null) !== row.sex) ||
      (dto.testType !== undefined && dto.testType.trim() !== row.testType) ||
      (dto.protocolCode !== undefined &&
        (dto.protocolCode?.trim() || null) !== row.protocolCode) ||
      (dto.version !== undefined && (dto.version.trim() || '1.0') !== row.version) ||
      (dto.effectiveFrom !== undefined &&
        normalizeDate(dto.effectiveFrom) !== normalizeDate(row.effectiveFrom)) ||
      (dto.effectiveTo !== undefined &&
        normalizeDate(dto.effectiveTo) !== normalizeDate(row.effectiveTo)) ||
      (dto.source !== undefined && dto.source !== row.source) ||
      (dto.sampleSize !== undefined && (dto.sampleSize ?? null) !== row.sampleSize) ||
      (dto.thresholds !== undefined &&
        JSON.stringify(dto.thresholds) !== JSON.stringify(row.thresholds));
    if (changesReference) await this.assertReferenceIsMutable(id);
    if (dto.name != null) row.name = dto.name.trim();
    if (dto.sport !== undefined) row.sport = dto.sport?.trim() || null;
    if (dto.ageGroup !== undefined) row.ageGroup = dto.ageGroup?.trim() || null;
    if (dto.sex !== undefined) row.sex = dto.sex?.trim().toLowerCase() || null;
    if (dto.testType != null) row.testType = dto.testType.trim();
    if (dto.protocolCode !== undefined) row.protocolCode = dto.protocolCode?.trim() || null;
    if (dto.version != null) row.version = dto.version.trim() || '1.0';
    if (dto.effectiveFrom !== undefined) {
      row.effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : null;
    }
    if (dto.effectiveTo !== undefined) {
      row.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    }
    if (dto.source != null) row.source = dto.source;
    if (dto.sampleSize !== undefined) row.sampleSize = dto.sampleSize ?? null;
    if (dto.description !== undefined) row.description = dto.description?.trim() || null;
    if (dto.thresholds != null) row.thresholds = dto.thresholds as CriteriaThresholds;
    if (dto.isActive != null) row.isActive = dto.isActive;
    return this.repo.save(row);
  }

  async remove(actor: User, id: string): Promise<{ ok: true }> {
    this.assertCanManage(actor);
    const row = await this.findById(id);
    await this.assertReferenceIsMutable(id);
    await this.repo.remove(row);
    return { ok: true };
  }

  private async assertReferenceIsMutable(id: string): Promise<void> {
    const uses = await this.repo.manager.count(PhysicalEvaluation, {
      where: { criteriaSetId: id },
    });
    if (uses > 0) {
      throw new BadRequestException(
        'Esta versión ya fue utilizada. Desactivala y creá una nueva versión para conservar los informes históricos.',
      );
    }
  }
}
