import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AthleteObjective,
  AthleteObjectiveType,
} from 'src/entities/athlete-objective.entity';
import { User } from 'src/entities/user.entity';
import {
  CreateAthleteObjectiveDto,
  UpdateAthleteObjectiveDto,
} from './dto/athlete-objective.dto';

@Injectable()
export class AthleteObjectivesService {
  constructor(
    @InjectRepository(AthleteObjective)
    private readonly objectiveRepo: Repository<AthleteObjective>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(userId: string, dto: CreateAthleteObjectiveDto): Promise<AthleteObjective> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const dates = this.resolveDates(dto.type, dto);

    const objective = this.objectiveRepo.create({
      user,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      type: dto.type,
      ...dates,
    });

    return this.objectiveRepo.save(objective);
  }

  async findByUser(userId: string): Promise<AthleteObjective[]> {
    const objectives = await this.objectiveRepo.find({
      where: { user: { id: userId } },
      relations: ['competition'],
      order: { createdAt: 'DESC' },
    });

    return objectives.sort((a, b) => this.sortKey(a) - this.sortKey(b));
  }

  private assertNotLinked(objective: AthleteObjective): void {
    if (objective.competitionId) {
      throw new BadRequestException(
        'Este objetivo está vinculado a una competencia del club y solo puede editarse desde Competencias',
      );
    }
  }

  async update(objectiveId: string, dto: UpdateAthleteObjectiveDto): Promise<AthleteObjective> {
    const objective = await this.objectiveRepo.findOne({
      where: { id: objectiveId },
      relations: ['user'],
    });
    if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
    this.assertNotLinked(objective);

    const nextType = dto.type ?? objective.type;

    if (dto.title !== undefined) objective.title = dto.title.trim();
    if (dto.description !== undefined) {
      objective.description = dto.description.trim() || null;
    }
    if (dto.type !== undefined) objective.type = dto.type;

    const dates = this.resolveDates(nextType, {
      type: nextType,
      targetDate: dto.targetDate,
      startDate: dto.startDate,
      endDate: dto.endDate,
    }, objective);

    objective.targetDate = dates.targetDate;
    objective.startDate = dates.startDate;
    objective.endDate = dates.endDate;

    return this.objectiveRepo.save(objective);
  }

  async remove(objectiveId: string): Promise<void> {
    const objective = await this.objectiveRepo.findOneBy({ id: objectiveId });
    if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
    this.assertNotLinked(objective);
    await this.objectiveRepo.remove(objective);
  }

  private resolveDates(
    type: AthleteObjectiveType,
    dto: {
      type: AthleteObjectiveType;
      targetDate?: string;
      startDate?: string;
      endDate?: string;
    },
    current?: AthleteObjective,
  ): Pick<AthleteObjective, 'targetDate' | 'startDate' | 'endDate'> {
    if (type === AthleteObjectiveType.SINGLE_DATE) {
      const raw = dto.targetDate ?? current?.targetDate?.toISOString().slice(0, 10);
      if (!raw) throw new BadRequestException('targetDate is required for single_date objectives');
      return {
        targetDate: this.parseDateOnly(raw),
        startDate: null,
        endDate: null,
      };
    }

    if (type === AthleteObjectiveType.DATE_RANGE) {
      const startRaw = dto.startDate ?? current?.startDate?.toISOString().slice(0, 10);
      const endRaw = dto.endDate ?? current?.endDate?.toISOString().slice(0, 10);
      if (!startRaw || !endRaw) {
        throw new BadRequestException('startDate and endDate are required for date_range objectives');
      }
      if (startRaw > endRaw) {
        throw new BadRequestException('startDate must be before or equal to endDate');
      }
      return {
        targetDate: null,
        startDate: this.parseDateOnly(startRaw),
        endDate: this.parseDateOnly(endRaw),
      };
    }

    return { targetDate: null, startDate: null, endDate: null };
  }

  private sortKey(objective: AthleteObjective): number {
    if (objective.type === AthleteObjectiveType.ANNUAL) return Number.MAX_SAFE_INTEGER;
    const date =
      objective.type === AthleteObjectiveType.SINGLE_DATE
        ? objective.targetDate
        : objective.startDate;
    return date ? new Date(date).getTime() : Number.MAX_SAFE_INTEGER - 1;
  }

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}
