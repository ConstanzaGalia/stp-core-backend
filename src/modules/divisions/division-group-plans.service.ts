import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DivisionGroupPlan } from '../../entities/division-group-plan.entity';
import { User } from '../../entities/user.entity';
import { UserRole } from '../../common/enums/enums';
import { DivisionAnalyticsService } from './division-analytics.service';
import { SaveDivisionGroupPlanDto } from './dto/division-group-plan.dto';
import { validateGroupPlanInput } from './group-plan-validation';

/** Armar y guardar grupos es del entrenador del centro; secretaría solo consulta. */
const EDIT_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
];

@Injectable()
export class DivisionGroupPlansService {
  constructor(
    @InjectRepository(DivisionGroupPlan)
    private readonly planRepository: Repository<DivisionGroupPlan>,
    private readonly analyticsService: DivisionAnalyticsService,
  ) {}

  async list(actor: User, divisionId: string): Promise<DivisionGroupPlan[]> {
    await this.analyticsService.assertCanAccessDivision(actor, divisionId);
    return this.planRepository.find({
      where: { divisionId },
      order: { updatedAt: 'DESC' },
    });
  }

  async create(
    actor: User,
    divisionId: string,
    dto: SaveDivisionGroupPlanDto,
  ): Promise<DivisionGroupPlan> {
    const division = await this.assertCanEdit(actor, divisionId);
    const { groups, unassigned } = await this.validate(actor, divisionId, dto);

    return this.planRepository.save(
      this.planRepository.create({
        divisionId,
        companyId: division.companyId,
        name: dto.name.trim(),
        objective: dto.objective,
        criteria: dto.criteria,
        groups,
        unassigned,
        createdById: actor.id,
      }),
    );
  }

  async update(
    actor: User,
    divisionId: string,
    planId: string,
    dto: SaveDivisionGroupPlanDto,
  ): Promise<DivisionGroupPlan> {
    await this.assertCanEdit(actor, divisionId);
    const plan = await this.findInDivision(divisionId, planId);
    const { groups, unassigned } = await this.validate(actor, divisionId, dto);

    plan.name = dto.name.trim();
    plan.objective = dto.objective;
    plan.criteria = dto.criteria;
    plan.groups = groups;
    plan.unassigned = unassigned;
    return this.planRepository.save(plan);
  }

  async remove(
    actor: User,
    divisionId: string,
    planId: string,
  ): Promise<{ deleted: true }> {
    await this.assertCanEdit(actor, divisionId);
    const plan = await this.findInDivision(divisionId, planId);
    await this.planRepository.remove(plan);
    return { deleted: true };
  }

  private async assertCanEdit(actor: User, divisionId: string) {
    const division = await this.analyticsService.assertCanAccessDivision(
      actor,
      divisionId,
    );
    if (!EDIT_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        'Solo el equipo de entrenadores del centro puede armar grupos',
      );
    }
    return division;
  }

  private async findInDivision(divisionId: string, planId: string) {
    const plan = await this.planRepository.findOne({
      where: { id: planId, divisionId },
    });
    if (!plan) throw new NotFoundException('Armado de grupos no encontrado');
    return plan;
  }

  private async validate(
    actor: User,
    divisionId: string,
    dto: SaveDivisionGroupPlanDto,
  ) {
    const { athletes } = await this.analyticsService.getRoster(
      actor,
      divisionId,
    );
    return validateGroupPlanInput(dto, new Set(athletes.map((a) => a.userId)));
  }
}
