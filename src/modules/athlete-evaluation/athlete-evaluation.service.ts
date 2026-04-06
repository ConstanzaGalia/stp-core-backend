import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AthleteEvaluation } from 'src/entities/athlete-evaluation.entity';
import { User } from 'src/entities/user.entity';
import { CreateEvaluationDto, UpdateAthleteProfileDto } from './dto/create-evaluation.dto';

@Injectable()
export class AthleteEvaluationService {
  constructor(
    @InjectRepository(AthleteEvaluation)
    private readonly evaluationRepo: Repository<AthleteEvaluation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private calculateScore(experiencia: number, controlMotor: number, capacidadEstructural: number): number {
    return +(experiencia * 0.4 + controlMotor * 0.4 + capacidadEstructural * 0.2).toFixed(2);
  }

  private calculateStpLevel(score: number): number {
    if (score < 2) return 1;
    if (score < 3) return 2;
    if (score < 4) return 3;
    if (score <= 4.5) return 4;
    return 5;
  }

  async createEvaluation(userId: string, dto: CreateEvaluationDto): Promise<AthleteEvaluation> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const scoreTotal = this.calculateScore(dto.experiencia, dto.controlMotor, dto.capacidadEstructural);
    const stpLevel = this.calculateStpLevel(scoreTotal);

    const evaluation = this.evaluationRepo.create({
      user,
      experiencia: dto.experiencia,
      controlMotor: dto.controlMotor,
      capacidadEstructural: dto.capacidadEstructural,
      scoreTotal,
      stpLevel,
      notas: dto.notas,
    });

    const saved = await this.evaluationRepo.save(evaluation);

    user.athleteScore = scoreTotal;
    user.stpLevel = stpLevel;
    await this.userRepo.save(user);

    return saved;
  }

  async getHistory(userId: string): Promise<AthleteEvaluation[]> {
    return this.evaluationRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async getCurrent(userId: string): Promise<AthleteEvaluation | null> {
    return this.evaluationRepo.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async updateProfile(userId: string, dto: UpdateAthleteProfileDto): Promise<User> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    if (dto.peso !== undefined) user.peso = dto.peso;
    if (dto.altura !== undefined) user.altura = dto.altura;
    if (dto.objetivo !== undefined) user.objetivo = dto.objetivo;

    return this.userRepo.save(user);
  }

  async getAthleteProfile(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name', 'lastName', 'email', 'peso', 'altura', 'objetivo', 'athleteScore', 'stpLevel', 'dateOfBirth'],
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const currentEval = await this.getCurrent(userId);

    return {
      ...user,
      currentEvaluation: currentEval,
    };
  }
}
