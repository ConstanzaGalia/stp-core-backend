import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AthleteInvitation, InvitationStatus } from '../../entities/athlete-invitation.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { UserRole } from '../../common/enums/enums';
import { MailingService } from '../mailer/mailing.service';
import { inviteStudentEmail } from '../../utils/emailTemplates';

@Injectable()
export class AthletesService {
  constructor(
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly mailingService: MailingService,
  ) {}

  // === MÉTODOS PARA ATLETAS ===

  /**
   * El atleta envía solicitud de unión a un centro
   */
  async requestToJoinCompany(
    athleteId: string,
    companyId: string,
    message?: string
  ): Promise<AthleteInvitation> {
    // Verificar que el atleta existe
    const athlete = await this.userRepository.findOne({
      where: { id: athleteId }
    });
    if (!athlete || athlete.role !== UserRole.ATHLETE) {
      throw new BadRequestException('User is not a valid athlete');
    }

    // Verificar que el centro existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId }
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que no hay invitación pendiente o ya aceptada
    const existingInvitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteId },
        company: { id: companyId }
      }
    });

    if (existingInvitation) {
      if (existingInvitation.status === InvitationStatus.PENDING) {
        throw new ConflictException('You already have a pending invitation to this company');
      }
      if (existingInvitation.status === InvitationStatus.APPROVED) {
        throw new ConflictException('You are already a member of this company');
      }
      // Si fue rechazada en el pasado, permite nueva solicitud
    }

    // Crear nueva invitación
    const invitation = this.invitationRepository.create({
      user: { id: athleteId },
      company: { id: companyId },
      status: InvitationStatus.PENDING,
      message
    });

    return await this.invitationRepository.save(invitation);
  }

  /**
   * El atleta ve sus invitaciones enviadas
   */
  async getMyInvitations(athleteId: string) {
    return await this.invitationRepository.find({
      where: { user: { id: athleteId } },
      relations: ['company'],
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Verificar si un atleta está suscrito a un centro específico
   */
  async checkAthleteSubscription(athleteId: string, companyId: string) {
    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteId },
        company: { id: companyId }
      },
      relations: ['user', 'company']
    });

    if (!invitation) {
      return {
        isSubscribed: false,
        status: 'not_requested',
        message: 'No has enviado solicitud a este centro'
      };
    }

    switch (invitation.status) {
      case InvitationStatus.PENDING:
        return {
          isSubscribed: false,
          status: 'pending',
          message: 'Solicitud pendiente de aprobación',
          invitation: {
            id: invitation.id,
            message: invitation.message,
            createdAt: invitation.createdAt
          }
        };

      case InvitationStatus.APPROVED:
        return {
          isSubscribed: true,
          status: 'approved',
          message: `Eres miembro de ${invitation.company.name}`,
          invitation: {
            id: invitation.id,
            approvedAt: invitation.approvedAt,
            companyResponse: invitation.companyResponse
          }
        };

      case InvitationStatus.REJECTED:
        return {
          isSubscribed: false,
          status: 'rejected',
          message: 'Tu solicitud fue rechazada',
          invitation: {
            id: invitation.id,
            rejectedAt: invitation.rejectedAt,
            companyResponse: invitation.companyResponse
          }
        };

      case InvitationStatus.LEFT:
        return {
          isSubscribed: false,
          status: 'left',
          message: 'Abandonaste este centro',
          invitation: {
            id: invitation.id,
            leftAt: invitation.leftAt
          }
        };

      default:
        return {
          isSubscribed: false,
          status: 'unknown',
          message: 'Estado desconocido'
        };
    }
  }

  /**
   * Obtener todos los centros a los que está suscrito un atleta
   */
  async getMySubscribedCenters(athleteId: string) {
    return await this.invitationRepository.find({
      where: {
        user: { id: athleteId },
        status: InvitationStatus.APPROVED
      },
      relations: ['company'],
      order: { approvedAt: 'DESC' }
    });
  }

  /**
   * El atleta abandona un centro
   */
  async leaveCompany(athleteId: string, companyId: string): Promise<AthleteInvitation> {
    // Buscar invitación aprobada
    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteId },
        company: { id: companyId },
        status: InvitationStatus.APPROVED
      },
      relations: ['user', 'company']
    });

    if (!invitation) {
      throw new NotFoundException('You are not a member of this company');
    }

    // Marcar como salido
    invitation.status = InvitationStatus.LEFT;
    invitation.leftAt = new Date();

    const updatedInvitation = await this.invitationRepository.save(invitation);

    // Remover del centro
    await this.removeUserFromCompany(athleteId, companyId);

    return updatedInvitation;
  }

  // === MÉTODOS PARA EMPRESAS ===

  /**
   * La empresa ve solicitudes pendientes
   */
  async getPendingInvitations(companyId: string) {
    return await this.invitationRepository.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.PENDING
      },
      relations: ['user'],
      order: { createdAt: 'ASC' }
    });
  }

  /**
   * La empresa aprueba una solicitud
   */
  async approveInvitation(
    companyId: string,
    invitationId: string,
    companyResponse?: string
  ): Promise<AthleteInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        id: invitationId,
        company: { id: companyId },
        status: InvitationStatus.PENDING
      },
      relations: ['user', 'company']
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or already processed');
    }

    // Marcar como aprobada
    invitation.status = InvitationStatus.APPROVED;
    invitation.approvedAt = new Date();
    invitation.companyResponse = companyResponse;

    const updatedInvitation = await this.invitationRepository.save(invitation);

    // Agregar al centro
    await this.addUserToCompany(invitation.user.id, companyId);

    // Enviar email de confirmación
    try {
      const mail = inviteStudentEmail(
        invitation.user.email,
        invitation.user.name,
        invitation.company.name,
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`,
        process.env.RESEND_FROM_EMAIL || 'noreply@stp.com'
      );
      
      // Modificar el template para confrmación en lugar de invitación
      mail.subject = `¡Tu solicitud ha sido aprobada por ${invitation.company.name}!`;
      mail.html = mail.html.replace(
        'te invita a formar parte de su centro de entrenamiento',
        'ha aprobado tu solicitud ' + (companyResponse ? `: "${companyResponse}"` : '')
      );

      await this.mailingService.sendMail(mail);
    } catch (error) {
      console.error('Error sending approval email:', error);
    }

    return updatedInvitation;
  }

  /**
   * La empresa rechaza una solicitud
   */
  async rejectInvitation(
    companyId: string,
    invitationId: string,
    companyResponse?: string
  ): Promise<AthleteInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        id: invitationId,
        company: { id: companyId },
        status: InvitationStatus.PENDING
      }
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or already processed');
    }

    invitation.status = InvitationStatus.REJECTED;
    invitation.rejectedAt = new Date();
    invitation.companyResponse = companyResponse;

    return await this.invitationRepository.save(invitation);
  }

  /**
   * La empresa ve sus atletas aprobados
   */
  async getCompanyAthletes(companyId: string) {
    return await this.invitationRepository.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.APPROVED
      },
      relations: ['user'],
      order: { approvedAt: 'DESC' }
    });
  }

  /**
   * Verificar si un atleta específico está suscrito a un centro (para empresas)
   */
  async checkAthleteInCompany(companyId: string, athleteId: string) {
    const invitation = await this.invitationRepository.findOne({
      where: {
        company: { id: companyId },
        user: { id: athleteId }
      },
      relations: ['user', 'company']
    });

    if (!invitation) {
      return {
        isSubscribed: false,
        status: 'not_requested',
        message: 'Este atleta no ha enviado solicitud a este centro'
      };
    }

    switch (invitation.status) {
      case InvitationStatus.PENDING:
        return {
          isSubscribed: false,
          status: 'pending',
          message: 'Solicitud pendiente de tu aprobación',
          athlete: {
            id: invitation.user.id,
            name: invitation.user.name,
            lastName: invitation.user.lastName,
            email: invitation.user.email
          },
          invitation: {
            id: invitation.id,
            message: invitation.message,
            createdAt: invitation.createdAt
          }
        };

      case InvitationStatus.APPROVED:
        return {
          isSubscribed: true,
          status: 'approved',
          message: 'Este atleta es miembro de tu centro',
          athlete: {
            id: invitation.user.id,
            name: invitation.user.name,
            lastName: invitation.user.lastName,
            email: invitation.user.email
          },
          invitation: {
            id: invitation.id,
            approvedAt: invitation.approvedAt,
            companyResponse: invitation.companyResponse
          }
        };

      case InvitationStatus.REJECTED:
        return {
          isSubscribed: false,
          status: 'rejected',
          message: 'Rechazaste a este atleta',
          athlete: {
            id: invitation.user.id,
            name: invitation.user.name,
            lastName: invitation.user.lastName,
            email: invitation.user.email
          },
          invitation: {
            id: invitation.id,
            rejectedAt: invitation.rejectedAt,
            companyResponse: invitation.companyResponse
          }
        };

      case InvitationStatus.LEFT:
        return {
          isSubscribed: false,
          status: 'left',
          message: 'Este atleta abandonó tu centro',
          athlete: {
            id: invitation.user.id,
            name: invitation.user.name,
            lastName: invitation.user.lastName,
            email: invitation.user.email
          },
          invitation: {
            id: invitation.id,
            leftAt: invitation.leftAt
          }
        };

      default:
        return {
          isSubscribed: false,
          status: 'unknown',
          message: 'Estado desconocido'
        };
    }
  }

  /**
   * La empresa remueve manualmente a un atleta
   */
  async removeAthlete(companyId: string, athleteId: string): Promise<AthleteInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        user: { id: athleteId },
        company: { id: companyId },
        status: InvitationStatus.APPROVED
      }
    });

    if (!invitation) {
      throw new NotFoundException('Athlete not found in this company');
    }

    invitation.status = InvitationStatus.LEFT;
    invitation.leftAt = new Date();

    const updatedInvitation = await this.invitationRepository.save(invitation);
    
    // Remover del centro
    await this.removeUserFromCompany(athleteId, companyId);

    return updatedInvitation;
  }

  // === MÉTODOS AUXILIARES PRIVADOS ===

  private async addUserToCompany(userId: string, companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users']
    });

    if (company) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user && !company.users.some(u => u.id === userId)) {
        company.users.push(user);
        await this.companyRepository.save(company);
      }
    }
  }

  private async removeUserFromCompany(userId: string, companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users']
    });

    if (company) {
      company.users = company.users.filter(user => user.id !== userId);
      await this.companyRepository.save(company);
    }
  }

  // === MÉTODOS ADMINISTRATIVOS ===

  /**
   * Obtener estadísticas generales
   */
  async getCompanyStatistics(companyId: string) {
    const stats = await this.invitationRepository
      .createQueryBuilder('invitation')
      .where('invitation.company = :companyId', { companyId })
      .select([
        'invitation.status',
        'COUNT(invitation.id) as count'
      ])
      .groupBy('invitation.status')
      .getRawMany();

    const result = {
      pending: 0,
      approved: 0,
      rejected: 0,
      left: 0
    };

    stats.forEach(stat => {
      result[stat.invitation_status] = parseInt(stat.count);
    });

    return result;
  }
}
