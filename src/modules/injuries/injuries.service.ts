import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Injury, InjuryKind, InjuryStatus } from 'src/entities/injury.entity';
import { User } from 'src/entities/user.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { CreateInjuryDto, UpdateInjuryDto, UpdateInjuryStatusDto } from './dto/injury.dto';
import { TrainingPlannerService } from '../training-planner/training-planner.service';

@Injectable()
export class InjuriesService {
  constructor(
    @InjectRepository(Injury)
    private readonly injuryRepo: Repository<Injury>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SafetyTag)
    private readonly safetyTagRepo: Repository<SafetyTag>,
    @Inject(forwardRef(() => TrainingPlannerService))
    private readonly trainingPlannerService: TrainingPlannerService,
  ) {}

  private async reauditAfterInjuryChange(userId: string): Promise<{
    blockedCount: number;
    sessionIds: string[];
  }> {
    try {
      return await this.trainingPlannerService.reauditFutureSessionsForAthlete(
        userId,
      );
    } catch {
      return { blockedCount: 0, sessionIds: [] };
    }
  }
  async create(userId: string, dto: CreateInjuryDto): Promise<Injury & {
    sessionsBlocked?: number;
  }> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const permanente = !!dto.permanente;
    if (permanente && dto.fechaResolucion) {
      throw new BadRequestException('Una condición permanente no puede tener fecha de fin');
    }

    const alreadyEnded = !permanente && !!dto.fechaResolucion;
    const injury = this.injuryRepo.create({
      user,
      tipo: dto.tipo,
      kind: dto.kind ?? InjuryKind.LESION,
      estado: alreadyEnded ? InjuryStatus.RESUELTA : InjuryStatus.ACTIVA,
      fechaInicio: this.parseDateOnly(dto.fechaInicio),
      fechaResolucion: alreadyEnded ? this.parseDateOnly(dto.fechaResolucion!) : null,
      permanente,
      notas: dto.notas,
    });

    // Solo aplica restricciones si el registro sigue activo
    if (!alreadyEnded && dto.restrictionTagIds?.length) {
      injury.restrictionTags = await this.safetyTagRepo.findBy({ id: In(dto.restrictionTagIds) });
    }

    const saved = await this.injuryRepo.save(injury);
    const reaudit = alreadyEnded
      ? { blockedCount: 0 }
      : await this.reauditAfterInjuryChange(userId);
    return Object.assign(saved, { sessionsBlocked: reaudit.blockedCount });
  }

  async findByUser(userId: string): Promise<Injury[]> {
    return this.injuryRepo.find({
      where: { user: { id: userId } },
      relations: ['restrictionTags'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(injuryId: string, dto: UpdateInjuryStatusDto): Promise<Injury & {
    sessionsBlocked?: number;
  }> {
    const injury = await this.injuryRepo.findOne({
      where: { id: injuryId },
      relations: ['restrictionTags', 'user'],
    });
    if (!injury) throw new NotFoundException(`Injury ${injuryId} not found`);

    if (injury.permanente && dto.estado === InjuryStatus.RESUELTA) {
      throw new BadRequestException(
        'No se puede finalizar una condición permanente. Desmarcá "permanente" primero.',
      );
    }

    const previousStatus = injury.estado;
    injury.estado = dto.estado;
    if (dto.notas !== undefined) injury.notas = dto.notas;

    if (dto.estado === InjuryStatus.RESUELTA) {
      injury.fechaResolucion = dto.fechaResolucion
        ? this.parseDateOnly(dto.fechaResolucion)
        : new Date();
    } else if (previousStatus === InjuryStatus.RESUELTA) {
      injury.fechaResolucion = null;
    }

    const saved = await this.injuryRepo.save(injury);
    const userId = injury.user?.id;
    const reaudit = userId
      ? await this.reauditAfterInjuryChange(userId)
      : { blockedCount: 0 };
    return Object.assign(saved, { sessionsBlocked: reaudit.blockedCount });
  }

  async update(injuryId: string, dto: UpdateInjuryDto): Promise<Injury & {
    sessionsBlocked?: number;
  }> {
    const injury = await this.injuryRepo.findOne({
      where: { id: injuryId },
      relations: ['restrictionTags', 'user'],
    });
    if (!injury) throw new NotFoundException(`Injury ${injuryId} not found`);

    if (dto.tipo !== undefined) injury.tipo = dto.tipo;
    if (dto.kind !== undefined) injury.kind = dto.kind;
    if (dto.notas !== undefined) injury.notas = dto.notas;
    if (dto.fechaInicio !== undefined) {
      injury.fechaInicio = this.parseDateOnly(dto.fechaInicio);
    }

    if (dto.permanente !== undefined) {
      injury.permanente = dto.permanente;
      if (dto.permanente) {
        injury.fechaResolucion = null;
        if (injury.estado === InjuryStatus.RESUELTA) {
          injury.estado = InjuryStatus.ACTIVA;
        }
      }
    }

    if (dto.fechaResolucion !== undefined) {
      const clearing =
        dto.fechaResolucion === null ||
        dto.fechaResolucion === '' ||
        (typeof dto.fechaResolucion === 'string' && !dto.fechaResolucion.trim());

      if (clearing || injury.permanente) {
        injury.fechaResolucion = null;
        if (injury.estado === InjuryStatus.RESUELTA) {
          injury.estado = InjuryStatus.ACTIVA;
        }
      } else {
        if (injury.permanente) {
          throw new BadRequestException('Una condición permanente no puede tener fecha de fin');
        }
        injury.fechaResolucion = this.parseDateOnly(dto.fechaResolucion);
        injury.estado = InjuryStatus.RESUELTA;
      }
    }

    const canEditTags = injury.estado !== InjuryStatus.RESUELTA;
    if (dto.restrictionTagIds !== undefined && canEditTags) {
      injury.restrictionTags = dto.restrictionTagIds.length
        ? await this.safetyTagRepo.findBy({ id: In(dto.restrictionTagIds) })
        : [];
    }

    const saved = await this.injuryRepo.save(injury);
    const userId = injury.user?.id;
    const reaudit = userId
      ? await this.reauditAfterInjuryChange(userId)
      : { blockedCount: 0 };
    return Object.assign(saved, { sessionsBlocked: reaudit.blockedCount });
  }

  async remove(injuryId: string): Promise<void> {
    const injury = await this.injuryRepo.findOneBy({ id: injuryId });
    if (!injury) throw new NotFoundException(`Injury ${injuryId} not found`);
    await this.injuryRepo.remove(injury);
  }

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  async getActiveTags(userId: string): Promise<SafetyTag[]> {
    const injuries = await this.injuryRepo.find({
      where: {
        user: { id: userId },
        estado: In([InjuryStatus.ACTIVA, InjuryStatus.RECUPERACION]),
      },
      relations: ['restrictionTags'],
    });

    const tagMap = new Map<number, SafetyTag>();
    for (const injury of injuries) {
      for (const tag of injury.restrictionTags || []) {
        tagMap.set(tag.id, tag);
      }
    }
    return Array.from(tagMap.values());
  }

  async findOne(injuryId: string): Promise<Injury> {
    const injury = await this.injuryRepo.findOne({
      where: { id: injuryId },
      relations: ['restrictionTags', 'user'],
    });
    if (!injury) throw new NotFoundException(`Injury ${injuryId} not found`);
    return injury;
  }
}
