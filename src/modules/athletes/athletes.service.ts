import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AthleteInvitation, InvitationStatus } from '../../entities/athlete-invitation.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { Division } from '../../entities/division.entity';
import {
  SubscriptionStatus,
  UserPaymentSubscription,
} from '../../entities/user-payment-subscription.entity';
import { PaymentPlan } from '../../entities/payment-plan.entity';
import { Reservation } from '../../entities/reservation.entity';
import { TimeSlot } from '../../entities/timeSlot.entity';
import { ClassUsage, ClassUsageType } from '../../entities/class-usage.entity';
import { CompanyAccountType, UserRole } from '../../common/enums/enums';
import {
  isCoachScopedRole,
  resolveCoachDivisionScope,
} from '../../common/helpers/division-scope.helper';
import { MailingService } from '../mailer/mailing.service';
import { EncryptService } from '../../services/bcrypt.service';
import { inviteStudentEmail, approvalStudentEmail } from '../../utils/emailTemplates';
import { CreateAthleteDto } from './dto/create-athlete.dto';
import {
  monthDayFromDateOnly,
  monthDayInArgentina,
  calendarDateInArgentina,
} from '../../common/utils/date-only.util';
import { resolveCenterTemporaryPassword } from '../../common/constants/center-temporary-password';

@Injectable()
export class AthletesService {
  private readonly logger = new Logger(AthletesService.name);

  constructor(
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(UserPaymentSubscription)
    private readonly subscriptionRepository: Repository<UserPaymentSubscription>,
    private readonly mailingService: MailingService,
    private readonly encryptService: EncryptService,
  ) {}

  // === MÉTODOS PARA ATLETAS ===

  private async findLatestAthleteCompanyInvitation(
    athleteId: string,
    companyId: string,
  ): Promise<AthleteInvitation | null> {
    const rows = await this.invitationRepository.find({
      where: {
        user: { id: athleteId },
        company: { id: companyId },
      },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  private async saveAthleteInvitation(
    invitation: AthleteInvitation,
  ): Promise<AthleteInvitation> {
    try {
      return await this.invitationRepository.save(invitation);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        this.logger.error(
          `saveAthleteInvitation failed: ${error.message}`,
          error.stack,
        );
        throw new BadRequestException(
          'No se pudo guardar la solicitud. Verificá el ID del centro o contactá al administrador.',
        );
      }
      throw error;
    }
  }

  /**
   * El atleta envía solicitud de unión a un centro
   */
  async requestToJoinCompany(
    athleteId: string,
    companyId: string,
    message?: string
  ): Promise<AthleteInvitation> {
    const athlete = await this.userRepository.findOne({
      where: { id: athleteId },
    });
    if (!athlete || athlete.role !== UserRole.ATHLETE) {
      throw new BadRequestException('Solo los atletas pueden solicitar unirse a un centro');
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('No se encontró un centro con ese ID');
    }
    if (company.isDelete) {
      throw new BadRequestException('Este centro no está activo');
    }

    const existingInvitation = await this.findLatestAthleteCompanyInvitation(
      athleteId,
      companyId,
    );

    if (existingInvitation) {
      if (existingInvitation.status === InvitationStatus.PENDING) {
        throw new ConflictException(
          'Ya tenés una solicitud pendiente para este centro',
        );
      }
      if (existingInvitation.status === InvitationStatus.APPROVED) {
        throw new ConflictException('Ya sos miembro de este centro');
      }
      existingInvitation.status = InvitationStatus.PENDING;
      existingInvitation.message = message ?? null;
      existingInvitation.companyResponse = null;
      existingInvitation.approvedAt = null;
      existingInvitation.rejectedAt = null;
      existingInvitation.leftAt = null;
      existingInvitation.isOnline = false;
      return await this.saveAthleteInvitation(existingInvitation);
    }

    const invitation = this.invitationRepository.create({
      user: { id: athleteId },
      company: { id: companyId },
      status: InvitationStatus.PENDING,
      message: message ?? null,
      isOnline: false,
    });

    return await this.saveAthleteInvitation(invitation);
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
    const latest = await this.findLatestAthleteCompanyInvitation(
      athleteId,
      companyId,
    );
    const invitation = latest
      ? await this.invitationRepository.findOne({
          where: { id: latest.id },
          relations: ['user', 'company'],
        })
      : null;

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
          message: `Eres miembro de ${invitation.company?.name ?? 'este centro'}`,
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
   * Obtener todos los centros a los que está suscrito un atleta.
   * Devuelve shape centrado en company (branding) + metadatos de membresía.
   */
  async getMySubscribedCenters(athleteId: string) {
    const invitations = await this.invitationRepository.find({
      where: {
        user: { id: athleteId },
        status: InvitationStatus.APPROVED
      },
      relations: ['company', 'division'],
      order: { approvedAt: 'DESC' }
    });

    return invitations
      .filter((invitation) => invitation.company?.id)
      .map((invitation) => ({
        id: invitation.company.id,
        name: invitation.company.name,
        image: invitation.company.image ?? null,
        primary_color: invitation.company.primary_color ?? null,
        secondary_color: invitation.company.secondary_color ?? null,
        accountType: invitation.company.accountType ?? null,
        subscriptionActive: invitation.company.subscriptionActive ?? null,
        enabledModules: invitation.company.enabledModules ?? null,
        isOnline: invitation.isOnline === true,
        approvedAt: invitation.approvedAt ?? null,
        invitationId: invitation.id,
        companyId: invitation.company.id,
        company: invitation.company,
        divisionId: invitation.division?.id ?? invitation.divisionId ?? null,
        divisionName: invitation.division?.name ?? null,
        division: invitation.division ?? null,
      }));
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
   * El entrenador/director crea un atleta directamente vinculado al centro.
   * La cuenta queda verificada y con contraseña temporal.
   */
  async createAthleteForCompany(
    companyId: string,
    createAthleteDto: CreateAthleteDto,
  ): Promise<{
    user: User;
    invitation: AthleteInvitation;
    temporaryPassword?: string;
    linked?: boolean;
  }> {
    const { name, lastName, email, isOnline = false, dateOfBirth, dni, phoneNumber, evaluationPortalOnly, sexo, peso, altura, homeBranchId } = createAthleteDto;

    // Verificar que el centro existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId }
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar si el email ya está registrado
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      const existingInvitation = await this.invitationRepository.findOne({
        where: {
          user: { id: existingUser.id },
          company: { id: companyId }
        }
      });
      if (existingInvitation?.status === InvitationStatus.APPROVED) {
        throw new ConflictException('Este atleta ya está registrado y vinculado al centro');
      }
      if (existingInvitation?.status === InvitationStatus.PENDING) {
        throw new ConflictException('Este atleta ya tiene una solicitud pendiente');
      }
      // Si existe pero no está vinculado, vincularlo y resetear a la contraseña temporal del centro
      if (existingUser.role === UserRole.ATHLETE) {
        const temporaryPassword = resolveCenterTemporaryPassword(company);
        const passwordEncrypted = await this.encryptService.encryptedData(temporaryPassword);
        existingUser.password = passwordEncrypted;
        existingUser.isActive = true;
        existingUser.activeToken = null;

        if (evaluationPortalOnly === true) {
          existingUser.evaluationPortalOnly = true;
        }
        if (sexo === 'femenino' || sexo === 'masculino') {
          existingUser.sexo = sexo;
        }
        if (peso != null && Number.isFinite(Number(peso))) {
          existingUser.peso = Number(peso);
        }
        if (altura != null && Number.isFinite(Number(altura))) {
          existingUser.altura = Number(altura);
        }
        await this.userRepository.save(existingUser);

        let savedInvitation: AthleteInvitation;
        if (
          existingInvitation &&
          (existingInvitation.status === InvitationStatus.LEFT ||
            existingInvitation.status === InvitationStatus.REJECTED)
        ) {
          existingInvitation.status = InvitationStatus.APPROVED;
          existingInvitation.approvedAt = new Date();
          existingInvitation.leftAt = null as any;
          existingInvitation.rejectedAt = null as any;
          existingInvitation.isOnline = isOnline ?? false;
          if (homeBranchId) existingInvitation.homeBranchId = homeBranchId;
          savedInvitation = await this.invitationRepository.save(existingInvitation);
        } else {
          const invitation = this.invitationRepository.create({
            user: existingUser,
            company: { id: companyId },
            status: InvitationStatus.APPROVED,
            approvedAt: new Date(),
            isOnline: isOnline ?? false,
            homeBranchId: homeBranchId ?? null,
          });
          savedInvitation = await this.invitationRepository.save(invitation);
        }

        await this.addUserToCompany(existingUser.id, companyId);
        return {
          user: existingUser,
          invitation: savedInvitation,
          temporaryPassword,
          linked: true,
        };
      }
      throw new ConflictException('El email ya está registrado con otro rol');
    }

    // Crear nuevo usuario atleta (verificado, sin activeToken)
    const temporaryPassword = resolveCenterTemporaryPassword(company);
    const passwordEncrypted = await this.encryptService.encryptedData(temporaryPassword);
    const parsedPhone = phoneNumber ? (() => {
      const digits = String(phoneNumber).replace(/\D/g, '');
      const num = parseInt(digits, 10);
      return !isNaN(num) ? num : undefined;
    })() : undefined;

    const trimmedDni = dni?.trim() || undefined;
    const newUser = this.userRepository.create({
      name,
      lastName,
      email,
      password: passwordEncrypted,
      role: UserRole.ATHLETE,
      isActive: true,
      activeToken: null,
      evaluationPortalOnly: evaluationPortalOnly === true,
      ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
      ...(trimmedDni && { dni: trimmedDni }),
      ...(parsedPhone !== undefined && { phoneNumber: parsedPhone }),
      ...(sexo === 'femenino' || sexo === 'masculino' ? { sexo } : {}),
      ...(peso != null && Number.isFinite(Number(peso)) ? { peso: Number(peso) } : {}),
      ...(altura != null && Number.isFinite(Number(altura)) ? { altura: Number(altura) } : {}),
    });
    const savedUser = await this.userRepository.save(newUser);

    // Crear invitación aprobada y vincular al centro
    const invitation = this.invitationRepository.create({
      user: savedUser,
      company: { id: companyId },
      status: InvitationStatus.APPROVED,
      approvedAt: new Date(),
      isOnline: isOnline ?? false,
      homeBranchId: homeBranchId ?? null,
    });
    const savedInvitation = await this.invitationRepository.save(invitation);
    await this.addUserToCompany(savedUser.id, companyId);

    return { user: savedUser, invitation: savedInvitation, temporaryPassword, linked: false };
  }

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

    // Enviar email al alumno confirmando que ya forma parte del centro
    try {
      const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard-atleta`;
      const mail = approvalStudentEmail(
        invitation.user.email,
        invitation.user.name,
        invitation.company.name,
        dashboardUrl,
        process.env.RESEND_FROM_EMAIL || 'noreply@stp.com',
        companyResponse
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
   * Entrenadores en clubes deportivos: solo atletas de sus divisiones asignadas.
   */
  async assertCoachCanAccessAthlete(
    actor: User,
    athleteUserId: string,
    sharedCompanyIds: string[],
  ): Promise<void> {
    if (!isCoachScopedRole(actor.role)) return;

    for (const companyId of sharedCompanyIds) {
      const scope = await resolveCoachDivisionScope(
        this.companyRepository,
        this.divisionRepository,
        actor,
        companyId,
      );
      if (!scope.scoped) continue;

      const invitation = await this.invitationRepository.findOne({
        where: {
          company: { id: companyId },
          user: { id: athleteUserId },
          status: InvitationStatus.APPROVED,
        },
      });
      if (!invitation) continue;

      if (
        scope.divisionIds.length === 0 ||
        !invitation.divisionId ||
        !scope.divisionIds.includes(invitation.divisionId)
      ) {
        throw new ForbiddenException('No tienes acceso a este atleta en tu división');
      }
      return;
    }
  }

  /**
   * La empresa ve sus atletas aprobados
   */
  async getCompanyAthletes(companyId: string, actor?: User) {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    const scope = await resolveCoachDivisionScope(
      this.companyRepository,
      this.divisionRepository,
      actor,
      companyId,
    );

    if (scope.scoped) {
      if (scope.divisionIds.length === 0) return [];

      const rows = await this.invitationRepository
        .createQueryBuilder('inv')
        .innerJoinAndSelect('inv.user', 'user')
        .leftJoinAndSelect('inv.division', 'division')
        .leftJoinAndSelect('inv.position', 'position')
        .where('inv.companyId = :cid', { cid: companyId })
        .andWhere('inv.status = :status', { status: InvitationStatus.APPROVED })
        .andWhere('inv.division_id IN (:...divIds)', { divIds: scope.divisionIds })
        .orderBy('inv.approvedAt', 'DESC')
        .getMany();

      const visible = rows.filter((inv) => !inv.user?.evaluationPortalOnly);
      if (company?.accountType !== CompanyAccountType.SPORTS_CLUB) {
        await this.attachActivePlanSummaries(companyId, visible);
      }
      return visible;
    }

    const isSportsClub = company?.accountType === CompanyAccountType.SPORTS_CLUB;
    const relations = isSportsClub ? ['user', 'division', 'position'] : ['user'];
    const rows = await this.invitationRepository.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.APPROVED,
      },
      relations,
      order: { approvedAt: 'DESC' },
    });
    const visible = rows.filter((inv) => !inv.user?.evaluationPortalOnly);
    if (!isSportsClub) {
      await this.attachActivePlanSummaries(companyId, visible);
    }
    return visible;
  }

  /**
   * Créditos del listado: asistencias ya marcadas en el período del plan.
   * Cuenta presente y ausente de un turno, y el presente sin reserva.
   * Un turno todavía sin marcar no suma.
   */
  private attendanceCreditsUsedSql(quote: (name: string) => string): string {
    const db = this.subscriptionRepository.manager;
    const reservationMeta = db.getRepository(Reservation).metadata;
    const slotMeta = db.getRepository(TimeSlot).metadata;
    const usageMeta = db.getRepository(ClassUsage).metadata;
    const subscriptionMeta = this.subscriptionRepository.metadata;

    const column = (meta: typeof reservationMeta, property: string) => {
      const found = meta.findColumnWithPropertyName(property);
      if (!found) throw new Error(`Columna no encontrada: ${meta.tableName}.${property}`);
      return found.databaseName;
    };
    const relationColumn = (meta: typeof reservationMeta, property: string) => {
      const found = meta.findRelationWithPropertyPath(property)?.joinColumns[0]?.databaseName;
      if (!found) throw new Error(`Relación no encontrada: ${meta.tableName}.${property}`);
      return found;
    };

    const reservationUser = relationColumn(reservationMeta, 'user');
    const reservationSlot = column(reservationMeta, 'timeSlotId');
    const attendance = column(reservationMeta, 'attendanceStatus');
    const slotId = slotMeta.primaryColumns[0]?.databaseName;
    const slotDate = column(slotMeta, 'date');
    const slotCompany = relationColumn(slotMeta, 'company');
    const usageUser = relationColumn(usageMeta, 'user');
    const usageCompany = relationColumn(usageMeta, 'company');
    const usageDate = column(usageMeta, 'usageDate');
    const usageType = column(usageMeta, 'type');
    const periodStart = column(subscriptionMeta, 'periodStartDate');
    const periodEnd = column(subscriptionMeta, 'periodEndDate');
    const subscriptionUser = relationColumn(subscriptionMeta, 'user');
    const subscriptionCompany = column(subscriptionMeta, 'companyId');

    if (!slotId) throw new Error('Clave de turno no encontrada');

    const reservationTable = quote(reservationMeta.tableName);
    const slotTable = quote(slotMeta.tableName);
    const usageTable = quote(usageMeta.tableName);

    const markedReservations = `
      SELECT COUNT(*)::int
      FROM ${reservationTable} r
      INNER JOIN ${slotTable} ts ON ts.${quote(slotId)} = r.${quote(reservationSlot)}
      WHERE r.${quote(reservationUser)} = s.${quote(subscriptionUser)}
        AND ts.${quote(slotCompany)} = s.${quote(subscriptionCompany)}
        AND r.${quote(attendance)} IS NOT NULL
        AND ts.${quote(slotDate)}::date >= s.${quote(periodStart)}::date
        AND ts.${quote(slotDate)}::date <= s.${quote(periodEnd)}::date
    `;

    const walkInsWithoutReservation = `
      SELECT COUNT(*)::int
      FROM ${usageTable} cu
      WHERE cu.${quote(usageUser)} = s.${quote(subscriptionUser)}
        AND cu.${quote(usageCompany)} = s.${quote(subscriptionCompany)}
        AND cu.${quote(usageType)} = '${ClassUsageType.WALK_IN}'
        AND cu.${quote(usageDate)}::date >= s.${quote(periodStart)}::date
        AND cu.${quote(usageDate)}::date <= s.${quote(periodEnd)}::date
        AND NOT EXISTS (
          SELECT 1
          FROM ${reservationTable} r2
          INNER JOIN ${slotTable} ts2 ON ts2.${quote(slotId)} = r2.${quote(reservationSlot)}
          WHERE r2.${quote(reservationUser)} = s.${quote(subscriptionUser)}
            AND ts2.${quote(slotCompany)} = s.${quote(subscriptionCompany)}
            AND r2.${quote(attendance)} IS NOT NULL
            AND ts2.${quote(slotDate)}::date = cu.${quote(usageDate)}::date
        )
    `;

    return `((${markedReservations}) + (${walkInsWithoutReservation}))`;
  }

  /** Vencimiento del plan activo y créditos usados por asistencia marcada en el período. */
  private async attachActivePlanSummaries(
    companyId: string,
    invitations: AthleteInvitation[],
  ): Promise<void> {
    const userIds = [...new Set(invitations.map((row) => row.user?.id).filter((id): id is string => Boolean(id)))];
    if (userIds.length === 0) return;

    const meta = this.subscriptionRepository.metadata;
    const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
    const column = (property: string) => {
      const found = meta.findColumnWithPropertyName(property);
      if (!found) throw new Error(`Columna de suscripción no encontrada: ${property}`);
      return found.databaseName;
    };
    const userFk = meta.findRelationWithPropertyPath('user')?.joinColumns[0]?.databaseName;
    if (!userFk) throw new Error('Relación de usuario de la suscripción no encontrada');

    const planMeta = this.subscriptionRepository.manager.getRepository(PaymentPlan).metadata;
    const planPk = planMeta.primaryColumns[0]?.databaseName;
    const maxCol = planMeta.findColumnWithPropertyName('maxClassesPerPeriod')?.databaseName;
    if (!planPk || !maxCol) throw new Error('Cupo del plan no encontrado');

    const attendanceUsedSql = this.attendanceCreditsUsedSql(quote);

    const summaries: Array<{
      userId: string;
      planExpiresAt: string | null;
      classesUsed: number | string | null;
      classesMax: number | string | null;
    }> = await this.subscriptionRepository.query(
      `SELECT DISTINCT ON (s.${quote(userFk)})
         s.${quote(userFk)} AS "userId",
         to_char(s.${quote(column('periodEndDate'))}, 'YYYY-MM-DD') AS "planExpiresAt",
         ${attendanceUsedSql} AS "classesUsed",
         p.${quote(maxCol)} AS "classesMax"
       FROM ${quote(meta.tableName)} s
       LEFT JOIN ${quote(planMeta.tableName)} p ON p.${quote(planPk)} = s.${quote(column('paymentPlanId'))}
       WHERE s.${quote(column('companyId'))} = $1
         AND s.${quote(column('status'))} = $2
         AND s.${quote(userFk)} = ANY($3::uuid[])
       ORDER BY s.${quote(userFk)}, s.${quote(column('periodEndDate'))} DESC`,
      [companyId, SubscriptionStatus.ACTIVE, userIds],
    );

    const byUser = new Map(summaries.map((row) => [row.userId, row]));
    for (const invitation of invitations) {
      const summary = invitation.user?.id ? byUser.get(invitation.user.id) : undefined;
      const target = invitation as AthleteInvitation & {
        planExpiresAt?: string | null;
        classesUsed?: number | null;
        classesMax?: number | null;
      };
      target.planExpiresAt = summary?.planExpiresAt ?? null;
      target.classesUsed = summary ? Number(summary.classesUsed ?? 0) : null;
      target.classesMax = summary?.classesMax == null ? null : Number(summary.classesMax);
    }
  }

  /** Incluye participantes solo evaluaciones (para hub de evaluaciones físicas). */
  async getCompanyAthletesIncludingPortal(companyId: string, actor?: User) {
    const scope = await resolveCoachDivisionScope(
      this.companyRepository,
      this.divisionRepository,
      actor,
      companyId,
    );

    if (scope.scoped) {
      if (scope.divisionIds.length === 0) return [];

      return await this.invitationRepository
        .createQueryBuilder('inv')
        .innerJoinAndSelect('inv.user', 'user')
        .leftJoinAndSelect('inv.division', 'division')
        .leftJoinAndSelect('inv.position', 'position')
        .where('inv.companyId = :cid', { cid: companyId })
        .andWhere('inv.status = :status', { status: InvitationStatus.APPROVED })
        .andWhere('inv.division_id IN (:...divIds)', { divIds: scope.divisionIds })
        .orderBy('inv.approvedAt', 'DESC')
        .getMany();
    }

    return await this.invitationRepository.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.APPROVED,
      },
      relations: ['user', 'division', 'position'],
      order: { approvedAt: 'DESC' },
    });
  }

  /**
   * Quita el modo "solo evaluaciones"; el atleta pasa al roster y flujo completo.
   */
  async promotePortalAthleteToFullMember(companyId: string, athleteId: string): Promise<User> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        company: { id: companyId },
        user: { id: athleteId },
        status: InvitationStatus.APPROVED,
      },
      relations: ['user'],
    });
    if (!invitation?.user) {
      throw new NotFoundException('Atleta no encontrado en el centro');
    }
    const user = invitation.user;
    if (!user.evaluationPortalOnly) {
      throw new BadRequestException('Este atleta no es un participante solo evaluaciones');
    }
    user.evaluationPortalOnly = false;
    return await this.userRepository.save(user);
  }

  /**
   * Atletas del centro que cumplen años hoy
   */
  async getBirthdaysToday(
    companyId: string,
    actor?: User,
  ): Promise<{ id: string; name: string; lastName: string }[]> {
    const athletes = await this.getCompanyAthletes(companyId, actor);
    const todayMMDD = monthDayInArgentina();
    return athletes
      .filter((inv) => {
        const dobMMDD = monthDayFromDateOnly(inv.user?.dateOfBirth);
        return Boolean(dobMMDD && dobMMDD === todayMMDD);
      })
      .map((inv) => ({
        id: inv.user!.id,
        name: inv.user!.name || '',
        lastName: inv.user!.lastName || '',
      }));
  }

  /**
   * Cumpleaños de hoy y de los próximos N días (incluye cruce de año).
   */
  async getBirthdaysUpcoming(
    companyId: string,
    days = 7,
    actor?: User,
  ): Promise<
    {
      id: string;
      name: string;
      lastName: string;
      monthDay: string;
      isToday: boolean;
      daysUntil: number;
    }[]
  > {
    const thresholdDays = Number.isFinite(days) && days > 0 ? days : 7;
    const athletes = await this.getCompanyAthletes(companyId, actor);
    const todayStr = calendarDateInArgentina();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const todayUtc = Date.UTC(ty, tm - 1, td);

    const results: {
      id: string;
      name: string;
      lastName: string;
      monthDay: string;
      isToday: boolean;
      daysUntil: number;
    }[] = [];

    for (const inv of athletes) {
      const monthDay = monthDayFromDateOnly(inv.user?.dateOfBirth);
      if (!monthDay || !inv.user) continue;

      const [mm, dd] = monthDay.split('-').map(Number);
      let candidateUtc = Date.UTC(ty, mm - 1, dd);
      if (candidateUtc < todayUtc) {
        candidateUtc = Date.UTC(ty + 1, mm - 1, dd);
      }
      const daysUntil = Math.round(
        (candidateUtc - todayUtc) / (1000 * 60 * 60 * 24),
      );
      if (daysUntil < 0 || daysUntil > thresholdDays) continue;

      results.push({
        id: inv.user.id,
        name: inv.user.name || '',
        lastName: inv.user.lastName || '',
        monthDay,
        isToday: daysUntil === 0,
        daysUntil,
      });
    }

    return results.sort((a, b) => a.daysUntil - b.daysUntil);
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

  /**
   * Actualizar si el atleta es online o no (para ocultar turnos/horario fijo)
   */
  async updateAthleteOnlineStatus(
    companyId: string,
    athleteId: string,
    isOnline: boolean,
  ): Promise<AthleteInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        company: { id: companyId },
        user: { id: athleteId },
        status: InvitationStatus.APPROVED,
      },
      relations: ['user'],
    });

    if (!invitation) {
      throw new NotFoundException('Athlete not found in this company');
    }

    invitation.isOnline = isOnline;
    return await this.invitationRepository.save(invitation);
  }

  async updateAthleteHomeBranch(
    companyId: string,
    athleteId: string,
    homeBranchId: string,
  ): Promise<AthleteInvitation> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        company: { id: companyId },
        user: { id: athleteId },
        status: InvitationStatus.APPROVED,
      },
    });
    if (!invitation) {
      throw new NotFoundException('Athlete not found in this company');
    }
    invitation.homeBranchId = homeBranchId;
    return this.invitationRepository.save(invitation);
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
