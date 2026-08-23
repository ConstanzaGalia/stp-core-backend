import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Injury, InjuryKind, InjuryStatus } from 'src/entities/injury.entity';
import { User } from 'src/entities/user.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { CreateInjuryDto, UpdateInjuryDto, UpdateInjuryStatusDto } from './dto/injury.dto';

@Injectable()
export class InjuriesService {
  constructor(
    @InjectRepository(Injury)
    private readonly injuryRepo: Repository<Injury>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SafetyTag)
    private readonly safetyTagRepo: Repository<SafetyTag>,
  ) {}

  async create(userId: string, dto: CreateInjuryDto): Promise<Injury> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const alreadyEnded = !!dto.fechaResolucion;
    const injury = this.injuryRepo.create({
      user,
      tipo: dto.tipo,
      kind: dto.kind ?? InjuryKind.LESION,
      estado: alreadyEnded ? InjuryStatus.RESUELTA : InjuryStatus.ACTIVA,
      fechaInicio: dto.fechaInicio,
      fechaResolucion: alreadyEnded ? this.parseDateOnly(dto.fechaResolucion!) : null,
      notas: dto.notas,
    });

    // Solo aplica restricciones si el registro sigue activo
    if (!alreadyEnded && dto.restrictionTagIds?.length) {
      injury.restrictionTags = await this.safetyTagRepo.findBy({ id: In(dto.restrictionTagIds) });
    }

    return this.injuryRepo.save(injury);
  }

  async findByUser(userId: string): Promise<Injury[]> {
    return this.injuryRepo.find({
      where: { user: { id: userId } },
      relations: ['restrictionTags'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(injuryId: string, dto: UpdateInjuryStatusDto): Promise<Injury> {
    const injury = await this.injuryRepo.findOne({
      where: { id: injuryId },
      relations: ['restrictionTags'],
    });
    if (!injury) throw new NotFoundException(`Injury ${injuryId} not found`);

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

    return this.injuryRepo.save(injury);
  }

  async update(injuryId: string, dto: UpdateInjuryDto): Promise<Injury> {
    const injury = await this.injuryRepo.findOne({
      where: { id: injuryId },
      relations: ['restrictionTags'],
    });
    if (!injury) throw new NotFoundException(`Injury ${injuryId} not found`);

    if (dto.tipo !== undefined) injury.tipo = dto.tipo;
    if (dto.kind !== undefined) injury.kind = dto.kind;
    if (dto.notas !== undefined) injury.notas = dto.notas;
    if (dto.fechaInicio !== undefined) {
      injury.fechaInicio = this.parseDateOnly(dto.fechaInicio);
    }

    if (dto.restrictionTagIds !== undefined && injury.estado !== InjuryStatus.RESUELTA) {
      injury.restrictionTags = dto.restrictionTagIds.length
        ? await this.safetyTagRepo.findBy({ id: In(dto.restrictionTagIds) })
        : [];
    }

    if (dto.fechaResolucion !== undefined) {
      injury.fechaResolucion = this.parseDateOnly(dto.fechaResolucion);
      injury.estado = InjuryStatus.RESUELTA;
    }

    return this.injuryRepo.save(injury);
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
