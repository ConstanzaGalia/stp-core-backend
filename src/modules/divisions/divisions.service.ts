import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Division } from '../../entities/division.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { AthleteInvitation, InvitationStatus } from '../../entities/athlete-invitation.entity';
import { UserRole } from '../../common/enums/enums';

@Injectable()
export class DivisionsService {
  constructor(
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
  ) {}

  private async assertCanManage(actor: User, companyId: string): Promise<Company> {
    if (actor.role === UserRole.STP_ADMIN) {
      const company = await this.companyRepository.findOne({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Centro no encontrado');
      return company;
    }
    const companies = await this.companyRepository
      .createQueryBuilder('c')
      .innerJoin('c.users', 'u', 'u.id = :uid', { uid: actor.id })
      .where('c.id = :cid', { cid: companyId })
      .getOne();
    if (!companies) throw new ForbiddenException('No perteneces a este centro');
    if (actor.role !== UserRole.DIRECTOR) {
      throw new ForbiddenException('Solo el coordinador o STP_ADMIN puede gestionar divisiones');
    }
    return companies;
  }

  async listByCompany(companyId: string): Promise<Division[]> {
    return this.divisionRepository.find({
      where: { companyId },
      relations: ['coaches'],
      order: { name: 'ASC' },
    });
  }

  async create(
    actor: User,
    companyId: string,
    dto: { name: string; description?: string },
  ): Promise<Division> {
    await this.assertCanManage(actor, companyId);
    const division = this.divisionRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      companyId,
    });
    return this.divisionRepository.save(division);
  }

  async update(
    actor: User,
    divisionId: string,
    dto: { name?: string; description?: string },
  ): Promise<Division> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
    });
    if (!division) throw new NotFoundException('División no encontrada');
    await this.assertCanManage(actor, division.companyId);
    if (dto.name !== undefined) division.name = dto.name;
    if (dto.description !== undefined) division.description = dto.description ?? null;
    return this.divisionRepository.save(division);
  }

  async remove(actor: User, divisionId: string): Promise<void> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
    });
    if (!division) throw new NotFoundException('División no encontrada');
    await this.assertCanManage(actor, division.companyId);
    await this.divisionRepository.remove(division);
  }

  async addCoach(actor: User, divisionId: string, coachId: string): Promise<Division> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
      relations: ['coaches'],
    });
    if (!division) throw new NotFoundException('División no encontrada');
    await this.assertCanManage(actor, division.companyId);
    const coach = await this.userRepository.findOne({ where: { id: coachId } });
    if (!coach) throw new NotFoundException('Entrenador no encontrado');
    const alreadyAssigned = division.coaches.some((c) => c.id === coachId);
    if (!alreadyAssigned) {
      division.coaches.push(coach);
      await this.divisionRepository.save(division);
    }
    return division;
  }

  async removeCoach(actor: User, divisionId: string, coachId: string): Promise<void> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
      relations: ['coaches'],
    });
    if (!division) throw new NotFoundException('División no encontrada');
    await this.assertCanManage(actor, division.companyId);
    division.coaches = division.coaches.filter((c) => c.id !== coachId);
    await this.divisionRepository.save(division);
  }

  async assignAthlete(
    actor: User,
    divisionId: string,
    athleteUserId: string,
  ): Promise<AthleteInvitation> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
    });
    if (!division) throw new NotFoundException('División no encontrada');
    await this.assertCanManage(actor, division.companyId);

    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteUserId },
        company: { id: division.companyId },
        status: InvitationStatus.APPROVED,
      },
    });
    if (!invitation) throw new NotFoundException('La jugadora no pertenece a este club');
    invitation.divisionId = divisionId;
    return this.invitationRepository.save(invitation);
  }

  async removeAthleteFromDivision(
    actor: User,
    divisionId: string,
    athleteUserId: string,
  ): Promise<void> {
    const division = await this.divisionRepository.findOne({
      where: { id: divisionId },
    });
    if (!division) throw new NotFoundException('División no encontrada');
    await this.assertCanManage(actor, division.companyId);

    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteUserId },
        company: { id: division.companyId },
        status: InvitationStatus.APPROVED,
        divisionId,
      },
    });
    if (!invitation) throw new NotFoundException('La jugadora no está asignada a esta división');
    invitation.divisionId = null;
    await this.invitationRepository.save(invitation);
  }
}
