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
      const existing = await this.repo.findOne({ where: { code: 'hockey_mayor_seleccion' } });
      if (existing) return;
      await this.repo.save(
        this.repo.create({
          code: 'hockey_mayor_seleccion',
          name: 'Hockey Mayor – Selección',
          sport: 'hockey',
          ageGroup: 'mayor',
          testType: 'cmj',
          description: 'Criterios fijos para devoluciones consistentes en selección hockey mayor.',
          thresholds: HOCKEY_MAYOR_THRESHOLDS,
          isActive: true,
        }),
      );
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
        testType: (dto.testType || 'cmj').trim(),
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
    if (dto.name != null) row.name = dto.name.trim();
    if (dto.sport !== undefined) row.sport = dto.sport?.trim() || null;
    if (dto.ageGroup !== undefined) row.ageGroup = dto.ageGroup?.trim() || null;
    if (dto.testType != null) row.testType = dto.testType.trim();
    if (dto.description !== undefined) row.description = dto.description?.trim() || null;
    if (dto.thresholds != null) row.thresholds = dto.thresholds as CriteriaThresholds;
    if (dto.isActive != null) row.isActive = dto.isActive;
    return this.repo.save(row);
  }

  async remove(actor: User, id: string): Promise<{ ok: true }> {
    this.assertCanManage(actor);
    const row = await this.findById(id);
    await this.repo.remove(row);
    return { ok: true };
  }
}
