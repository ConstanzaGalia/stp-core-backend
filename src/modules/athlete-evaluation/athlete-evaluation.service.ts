import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AthleteEvaluation } from 'src/entities/athlete-evaluation.entity';
import { User } from 'src/entities/user.entity';
import { CreateEvaluationDto, UpdateAthleteProfileDto } from './dto/create-evaluation.dto';
import { UserRole } from 'src/common/enums/enums';
import { CompanyService } from '../company/company.service';
import { AthletesService } from '../athletes/athletes.service';

const STAFF_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

@Injectable()
export class AthleteEvaluationService {
  constructor(
    @InjectRepository(AthleteEvaluation)
    private readonly evaluationRepo: Repository<AthleteEvaluation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly companyService: CompanyService,
    private readonly athletesService: AthletesService,
  ) {}

  private isStaff(user: User): boolean {
    return STAFF_ROLES.includes(user.role);
  }

  private async loadAthleteOrThrow(athleteUserId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: athleteUserId } });
    if (!user) throw new NotFoundException(`User ${athleteUserId} not found`);
    if (user.role !== UserRole.ATHLETE) {
      throw new BadRequestException('El usuario indicado no es un atleta');
    }
    return user;
  }

  /** Lectura de evaluaciones / perfil STP: el propio atleta o staff con centro compartido. */
  private async assertCanReadAthlete(actor: User, athleteUserId: string): Promise<void> {
    const target = await this.loadAthleteOrThrow(athleteUserId);
    if (actor.role === UserRole.ATHLETE) {
      if (actor.id !== athleteUserId) throw new ForbiddenException('No puedes ver datos de otro atleta');
      return;
    }
    if (!this.isStaff(actor)) throw new ForbiddenException('Sin permiso');
    if (actor.role === UserRole.STP_ADMIN) return;
    const staffCompanies = await this.companyService.findCompaniesByUser(actor.id);
    const staffIds = new Set(staffCompanies.map((c) => c.id));
    const subs = await this.athletesService.getMySubscribedCenters(athleteUserId);
    const athleteCompanyIds = subs.map((inv) => inv.company?.id).filter(Boolean) as string[];
    const shares = athleteCompanyIds.some((id) => staffIds.has(id));
    if (!shares) {
      throw new ForbiddenException('No tienes acceso a este atleta en tu centro');
    }
  }

  /** Crear evaluación STP legacy: solo staff con centro compartido (o STP_ADMIN). */
  private async assertStaffCanWriteEvaluations(actor: User, athleteUserId: string): Promise<User> {
    const target = await this.loadAthleteOrThrow(athleteUserId);
    if (actor.role === UserRole.ATHLETE) {
      throw new ForbiddenException('Los atletas no pueden registrar esta evaluación');
    }
    if (!this.isStaff(actor)) throw new ForbiddenException('Sin permiso');
    if (actor.role === UserRole.STP_ADMIN) return target;
    const staffCompanies = await this.companyService.findCompaniesByUser(actor.id);
    const staffIds = new Set(staffCompanies.map((c) => c.id));
    const subs = await this.athletesService.getMySubscribedCenters(athleteUserId);
    const athleteCompanyIds = subs.map((inv) => inv.company?.id).filter(Boolean) as string[];
    const shares = athleteCompanyIds.some((id) => staffIds.has(id));
    if (!shares) {
      throw new ForbiddenException('No tienes acceso a este atleta en tu centro');
    }
    return target;
  }

  /** Actualizar biometría: el atleta sobre sí mismo o staff con acceso a centro. */
  private async assertCanUpdateProfile(actor: User, athleteUserId: string): Promise<User> {
    const target = await this.loadAthleteOrThrow(athleteUserId);
    if (actor.role === UserRole.ATHLETE) {
      if (actor.id !== athleteUserId) throw new ForbiddenException('No puedes editar el perfil de otro usuario');
      return target;
    }
    if (!this.isStaff(actor)) throw new ForbiddenException('Sin permiso');
    if (actor.role === UserRole.STP_ADMIN) return target;
    const staffCompanies = await this.companyService.findCompaniesByUser(actor.id);
    const staffIds = new Set(staffCompanies.map((c) => c.id));
    const subs = await this.athletesService.getMySubscribedCenters(athleteUserId);
    const athleteCompanyIds = subs.map((inv) => inv.company?.id).filter(Boolean) as string[];
    const shares = athleteCompanyIds.some((id) => staffIds.has(id));
    if (!shares) {
      throw new ForbiddenException('No tienes acceso a este atleta en tu centro');
    }
    return target;
  }

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

  async createEvaluation(actor: User, userId: string, dto: CreateEvaluationDto): Promise<AthleteEvaluation> {
    const user = await this.assertStaffCanWriteEvaluations(actor, userId);

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

  async getHistory(actor: User, userId: string): Promise<AthleteEvaluation[]> {
    await this.assertCanReadAthlete(actor, userId);
    return this.evaluationRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async getCurrent(actor: User, userId: string): Promise<AthleteEvaluation | null> {
    await this.assertCanReadAthlete(actor, userId);
    return this.evaluationRepo.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async updateProfile(actor: User, userId: string, dto: UpdateAthleteProfileDto): Promise<User> {
    const user = await this.assertCanUpdateProfile(actor, userId);

    if (dto.peso !== undefined) user.peso = dto.peso;
    if (dto.altura !== undefined) user.altura = dto.altura;
    if (dto.objetivo !== undefined) user.objetivo = dto.objetivo;

    return this.userRepo.save(user);
  }

  async getAthleteProfile(actor: User, userId: string) {
    await this.assertCanReadAthlete(actor, userId);
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name', 'lastName', 'email', 'peso', 'altura', 'objetivo', 'athleteScore', 'stpLevel', 'dateOfBirth'],
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const currentEval = await this.evaluationRepo.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    return {
      ...user,
      currentEvaluation: currentEval,
    };
  }
}
