import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Injury, InjuryStatus } from 'src/entities/injury.entity';
import { User } from 'src/entities/user.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { CreateInjuryDto, UpdateInjuryStatusDto } from './dto/injury.dto';

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

    const injury = this.injuryRepo.create({
      user,
      tipo: dto.tipo,
      estado: InjuryStatus.ACTIVA,
      fechaInicio: dto.fechaInicio,
      notas: dto.notas,
    });

    if (dto.restrictionTagIds?.length) {
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

    injury.estado = dto.estado;
    if (dto.notas !== undefined) injury.notas = dto.notas;

    if (dto.estado === InjuryStatus.RESUELTA) {
      injury.fechaResolucion = new Date();
    }

    return this.injuryRepo.save(injury);
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
