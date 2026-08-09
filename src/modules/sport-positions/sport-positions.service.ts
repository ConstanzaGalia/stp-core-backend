import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SportPosition } from '../../entities/sport-position.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { AthleteInvitation, InvitationStatus } from '../../entities/athlete-invitation.entity';
import { UserRole, CompanyAccountType } from '../../common/enums/enums';

const STAFF_VIEW_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

@Injectable()
export class SportPositionsService {
  constructor(
    @InjectRepository(SportPosition)
    private readonly positionRepository: Repository<SportPosition>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
  ) {}

  private async assertCanManage(actor: User, companyId: string): Promise<Company> {
    let company: Company | null = null;

    if (actor.role === UserRole.STP_ADMIN) {
      company = await this.companyRepository.findOne({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Centro no encontrado');
    } else {
      company = await this.companyRepository
        .createQueryBuilder('c')
        .innerJoin('c.users', 'u', 'u.id = :uid', { uid: actor.id })
        .where('c.id = :cid', { cid: companyId })
        .getOne();

      if (!company) throw new ForbiddenException('No perteneces a este centro');
      if (actor.role !== UserRole.DIRECTOR) {
        throw new ForbiddenException('Solo el coordinador o STP_ADMIN puede gestionar posiciones');
      }
    }

    if (company.accountType !== CompanyAccountType.SPORTS_CLUB) {
      throw new BadRequestException(
        'Las posiciones solo están disponibles para clubes deportivos',
      );
    }
    return company;
  }

  private async assertCanView(actor: User | undefined, companyId: string): Promise<Company> {
    if (!actor) {
      throw new ForbiddenException('No autenticado');
    }

    if (actor.role === UserRole.STP_ADMIN) {
      const company = await this.companyRepository.findOne({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Centro no encontrado');
      if (company.accountType !== CompanyAccountType.SPORTS_CLUB) {
        throw new BadRequestException(
          'Las posiciones solo están disponibles para clubes deportivos',
        );
      }
      return company;
    }

    if (!STAFF_VIEW_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Sin permiso');
    }

    const company = await this.companyRepository
      .createQueryBuilder('c')
      .innerJoin('c.users', 'u', 'u.id = :uid', { uid: actor.id })
      .where('c.id = :cid', { cid: companyId })
      .getOne();

    if (!company) throw new ForbiddenException('No perteneces a este centro');
    if (company.accountType !== CompanyAccountType.SPORTS_CLUB) {
      throw new BadRequestException(
        'Las posiciones solo están disponibles para clubes deportivos',
      );
    }
    return company;
  }

  async listByCompany(companyId: string, actor?: User): Promise<SportPosition[]> {
    await this.assertCanView(actor, companyId);
    return this.positionRepository.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
  }

  async create(
    actor: User,
    companyId: string,
    dto: { name: string; description?: string },
  ): Promise<SportPosition> {
    await this.assertCanManage(actor, companyId);
    const position = this.positionRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      companyId,
    });
    return this.positionRepository.save(position);
  }

  async update(
    actor: User,
    positionId: string,
    dto: { name?: string; description?: string },
  ): Promise<SportPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });
    if (!position) throw new NotFoundException('Posición no encontrada');
    await this.assertCanManage(actor, position.companyId);
    if (dto.name !== undefined) position.name = dto.name;
    if (dto.description !== undefined) position.description = dto.description ?? null;
    return this.positionRepository.save(position);
  }

  async remove(actor: User, positionId: string): Promise<void> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });
    if (!position) throw new NotFoundException('Posición no encontrada');
    await this.assertCanManage(actor, position.companyId);
    await this.positionRepository.remove(position);
  }

  async assignAthlete(
    actor: User,
    positionId: string,
    athleteUserId: string,
  ): Promise<AthleteInvitation> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });
    if (!position) throw new NotFoundException('Posición no encontrada');
    await this.assertCanManage(actor, position.companyId);

    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteUserId },
        company: { id: position.companyId },
        status: InvitationStatus.APPROVED,
      },
    });
    if (!invitation) throw new NotFoundException('El jugador no pertenece a este club');
    invitation.positionId = positionId;
    return this.invitationRepository.save(invitation);
  }

  async removeAthleteFromPosition(
    actor: User,
    positionId: string,
    athleteUserId: string,
  ): Promise<void> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });
    if (!position) throw new NotFoundException('Posición no encontrada');
    await this.assertCanManage(actor, position.companyId);

    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteUserId },
        company: { id: position.companyId },
        status: InvitationStatus.APPROVED,
        positionId,
      },
    });
    if (!invitation) throw new NotFoundException('El jugador no tiene esta posición asignada');
    invitation.positionId = null;
    await this.invitationRepository.save(invitation);
  }
}
