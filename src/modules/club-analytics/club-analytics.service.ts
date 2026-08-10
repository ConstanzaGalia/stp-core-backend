import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClubAnalyticsTrainer } from '../../entities/club-analytics-trainer.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { ClubAnalyticsSexScope, UserRole } from '../../common/enums/enums';
import { isAtahCenter } from '../../common/constants/atah-center';
import {
  athleteMatchesClubCode,
  buildAtahClubOptions,
  getAtahClubLabel,
  isValidAtahClubOptionCode,
  sexScopeLabel,
  sexScopeMatchesAthlete,
  type AtahClubOption,
} from '../../common/constants/atah-clubs';
import { getStpOperatingCompanyId } from '../../common/constants/stp-operating-company';
import { EncryptService } from '../../services/bcrypt.service';
import { MailingService } from '../mailer/mailing.service';
import { clubAnalyticsAccessEmail } from '../../utils/emailTemplates';
import { DivisionAnalyticsService } from '../divisions/division-analytics.service';
import { InvitationStatus } from '../../entities/athlete-invitation.entity';
import {
  CreateClubAnalyticsTrainerDto,
  UpdateClubAnalyticsTrainerDto,
} from './dto/club-analytics.dto';

const DEFAULT_TEMP_PASSWORD = 'EntrenamientoSTP1@';

@Injectable()
export class ClubAnalyticsService {
  private readonly logger = new Logger(ClubAnalyticsService.name);

  constructor(
    @InjectRepository(ClubAnalyticsTrainer)
    private readonly accessRepository: Repository<ClubAnalyticsTrainer>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly encryptService: EncryptService,
    private readonly mailingService: MailingService,
    private readonly divisionAnalytics: DivisionAnalyticsService,
  ) {}

  private assertDirectorAtah(actor: User, companyId: string) {
    if (!isAtahCenter(companyId)) {
      throw new ForbiddenException('Esta sección solo está disponible para el centro ATAH');
    }
    if (actor.role !== UserRole.DIRECTOR && actor.role !== UserRole.STP_ADMIN) {
      throw new ForbiddenException('Solo el director puede gestionar estos accesos');
    }
  }

  private async assertCompanyMembership(userId: string, companyId: string) {
    const membership = await this.companyRepository
      .createQueryBuilder('c')
      .innerJoin('c.users', 'u', 'u.id = :uid', { uid: userId })
      .where('c.id = :cid', { cid: companyId })
      .getOne();
    if (!membership) {
      throw new ForbiddenException('No pertenecés a este centro');
    }
  }

  private async getCompanyOrThrow(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) throw new NotFoundException('Centro no encontrado');
    return company;
  }

  private async loadClubOptions(companyId: string): Promise<AtahClubOption[]> {
    const rows: Array<{ name: string; count: string }> = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin('athlete_invitations', 'ai', 'ai."userId" = u.id')
      .select('TRIM(u.club_name)', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('ai."companyId" = :cid', { cid: companyId })
      .andWhere('ai.status = :status', { status: InvitationStatus.APPROVED })
      .andWhere('u.role = :role', { role: UserRole.ATHLETE })
      .andWhere('u.club_name IS NOT NULL')
      .andWhere("TRIM(u.club_name) <> ''")
      .groupBy('TRIM(u.club_name)')
      .getRawMany();

    return buildAtahClubOptions(
      rows.map((r) => ({
        name: r.name,
        count: Number(r.count) || undefined,
      })),
    );
  }

  private async assertValidClubCode(companyId: string, clubCode: string) {
    const options = await this.loadClubOptions(companyId);
    if (!isValidAtahClubOptionCode(clubCode, options)) {
      throw new BadRequestException('Club inválido');
    }
    return options;
  }

  private resolveClubLabel(clubCode: string, options?: AtahClubOption[]): string | null {
    return getAtahClubLabel(clubCode, options) ?? null;
  }

  private serializeAccess(row: ClubAnalyticsTrainer, options?: AtahClubOption[]) {
    return {
      id: row.id,
      userId: row.userId,
      companyId: row.companyId,
      clubCode: row.clubCode,
      clubLabel: this.resolveClubLabel(row.clubCode, options),
      sexScope: row.sexScope,
      sexScopeLabel: sexScopeLabel(row.sexScope),
      active: row.active,
      createdAt: row.createdAt,
      user: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            lastName: row.user.lastName,
            email: row.user.email,
            isActive: row.user.isActive,
          }
        : null,
    };
  }

  async listClubOptions(actor: User, companyId: string) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }
    return this.loadClubOptions(companyId);
  }

  async listAccesses(actor: User, companyId: string) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }
    const [rows, options] = await Promise.all([
      this.accessRepository.find({
        where: { companyId },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      }),
      this.loadClubOptions(companyId),
    ]);
    return rows.map((r) => this.serializeAccess(r, options));
  }

  async createAccess(actor: User, companyId: string, dto: CreateClubAnalyticsTrainerDto) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }
    const options = await this.assertValidClubCode(companyId, dto.clubCode);

    const company = await this.getCompanyOrThrow(companyId);
    const email = dto.email.trim().toLowerCase();
    const tempPassword = dto.password?.trim() || DEFAULT_TEMP_PASSWORD;

    let user = await this.userRepository.findOne({ where: { email } });
    let createdUser = false;

    if (user) {
      const existingAccess = await this.accessRepository.findOne({
        where: { userId: user.id, companyId },
      });
      if (existingAccess) {
        throw new ConflictException('Este email ya tiene un acceso de analytics en el centro');
      }
      if (user.role === UserRole.ATHLETE) {
        throw new BadRequestException(
          'El email pertenece a un atleta. Usá otro email para el acceso analytics.',
        );
      }
      user.role = UserRole.TRAINER_ONLY_ANALYTICS;
      user.name = dto.name.trim();
      user.lastName = dto.lastName.trim();
      user.isActive = true;
      user.password = await this.encryptService.encryptedData(tempPassword);
      await this.userRepository.save(user);
    } else {
      createdUser = true;
      user = this.userRepository.create({
        name: dto.name.trim(),
        lastName: dto.lastName.trim(),
        email,
        password: await this.encryptService.encryptedData(tempPassword),
        role: UserRole.TRAINER_ONLY_ANALYTICS,
        isActive: true,
        activeToken: null,
      });
      user = await this.userRepository.save(user);
    }

    const alreadyInCompany = company.users?.some((u) => u.id === user!.id);
    if (!alreadyInCompany) {
      company.users = [...(company.users ?? []), user];
      await this.companyRepository.save(company);
    }

    const access = this.accessRepository.create({
      userId: user.id,
      companyId,
      clubCode: dto.clubCode,
      sexScope: dto.sexScope,
      createdById: actor.id,
      active: true,
    });
    const saved = await this.accessRepository.save(access);
    const withUser = await this.accessRepository.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });

    const emailSent = await this.sendWelcomeEmail({
      user,
      company,
      clubCode: dto.clubCode,
      clubLabel: this.resolveClubLabel(dto.clubCode, options) ?? dto.clubCode,
      sexScope: dto.sexScope,
      password: tempPassword,
    });

    return {
      access: this.serializeAccess(withUser!, options),
      temporaryPassword: tempPassword,
      emailSent,
      createdUser,
    };
  }

  async createAccessBatch(actor: User, companyId: string, trainers: CreateClubAnalyticsTrainerDto[]) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }

    const results: Array<{
      email: string;
      success: boolean;
      access?: ReturnType<ClubAnalyticsService['serializeAccess']>;
      temporaryPassword?: string;
      emailSent?: boolean;
      error?: string;
    }> = [];

    for (const dto of trainers) {
      const email = dto.email?.trim().toLowerCase() || '';
      try {
        const created = await this.createAccess(actor, companyId, dto);
        results.push({
          email: created.access.user?.email ?? email,
          success: true,
          access: created.access,
          temporaryPassword: created.emailSent ? undefined : created.temporaryPassword,
          emailSent: created.emailSent,
        });
      } catch (error) {
        let message = 'No se pudo crear el acceso';
        if (error instanceof HttpException) {
          const res = error.getResponse();
          if (typeof res === 'string') message = res;
          else if (res && typeof res === 'object' && 'message' in res) {
            const m = (res as { message?: string | string[] }).message;
            message = Array.isArray(m) ? m.join(', ') : String(m ?? error.message);
          } else {
            message = error.message;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }
        results.push({ email, success: false, error: message });
      }
    }

    const created = results.filter((r) => r.success).length;
    return {
      results,
      summary: {
        total: results.length,
        created,
        failed: results.length - created,
      },
    };
  }

  async updateAccess(
    actor: User,
    companyId: string,
    accessId: string,
    dto: UpdateClubAnalyticsTrainerDto,
  ) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }
    const row = await this.accessRepository.findOne({
      where: { id: accessId, companyId },
      relations: ['user'],
    });
    if (!row) throw new NotFoundException('Acceso no encontrado');

    let options = await this.loadClubOptions(companyId);
    if (dto.clubCode != null) {
      options = await this.assertValidClubCode(companyId, dto.clubCode);
      row.clubCode = dto.clubCode;
    }
    if (dto.sexScope != null) row.sexScope = dto.sexScope;
    if (dto.active != null) {
      row.active = dto.active;
      if (row.user) {
        row.user.isActive = dto.active;
        await this.userRepository.save(row.user);
      }
    }
    await this.accessRepository.save(row);
    return this.serializeAccess(row, options);
  }

  async deleteAccess(actor: User, companyId: string, accessId: string) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }
    const row = await this.accessRepository.findOne({
      where: { id: accessId, companyId },
      relations: ['user'],
    });
    if (!row) throw new NotFoundException('Acceso no encontrado');

    const user = row.user;
    await this.accessRepository.remove(row);

    if (user?.role === UserRole.TRAINER_ONLY_ANALYTICS) {
      const otherAccesses = await this.accessRepository.count({
        where: { userId: user.id },
      });
      if (otherAccesses === 0) {
        user.isActive = false;
        await this.userRepository.save(user);
      }
    }

    return { deleted: true, accessId };
  }

  async resendWelcomeEmail(actor: User, companyId: string, accessId: string) {
    this.assertDirectorAtah(actor, companyId);
    if (actor.role !== UserRole.STP_ADMIN) {
      await this.assertCompanyMembership(actor.id, companyId);
    }
    const row = await this.accessRepository.findOne({
      where: { id: accessId, companyId },
      relations: ['user'],
    });
    if (!row?.user) throw new NotFoundException('Acceso no encontrado');
    if (!row.active) throw new BadRequestException('El acceso está inactivo');

    const company = await this.getCompanyOrThrow(companyId);
    const options = await this.loadClubOptions(companyId);
    const tempPassword = DEFAULT_TEMP_PASSWORD;
    row.user.password = await this.encryptService.encryptedData(tempPassword);
    await this.userRepository.save(row.user);

    const emailSent = await this.sendWelcomeEmail({
      user: row.user,
      company,
      clubCode: row.clubCode,
      clubLabel: this.resolveClubLabel(row.clubCode, options) ?? row.clubCode,
      sexScope: row.sexScope,
      password: tempPassword,
    });

    return {
      emailSent,
      temporaryPassword: emailSent ? undefined : tempPassword,
    };
  }

  private async sendWelcomeEmail(input: {
    user: User;
    company: Company;
    clubCode: string;
    clubLabel: string;
    sexScope: ClubAnalyticsSexScope;
    password: string;
  }): Promise<boolean> {
    try {
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const loginUrl = `${frontendUrl}/analytics-evaluaciones/acceder`;
      const from = process.env.RESEND_FROM_EMAIL || 'noreply@stp.com';
      const centerLogoUrl =
        process.env.EMAIL_CENTER_LOGO_URL?.trim() ||
        (input.company.image?.startsWith('http') ? input.company.image : null);

      const mail = clubAnalyticsAccessEmail({
        email: input.user.email,
        name: input.user.name,
        centerName: input.company.name,
        centerLogoUrl,
        clubLabel: input.clubLabel,
        sexScopeLabel: sexScopeLabel(input.sexScope),
        loginUrl,
        password: input.password,
        from,
        showPoweredByStp: input.company.id !== getStpOperatingCompanyId(),
      });
      await this.mailingService.sendMail(mail);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send club analytics welcome email to ${input.user.email}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  async findActiveAccessByUserId(userId: string): Promise<ClubAnalyticsTrainer | null> {
    return this.accessRepository.findOne({
      where: { userId, active: true },
      relations: ['company', 'user'],
    });
  }

  async getPortalMe(actor: User) {
    if (actor.role !== UserRole.TRAINER_ONLY_ANALYTICS) {
      throw new ForbiddenException('Sin acceso al portal analytics de club');
    }
    const access = await this.findActiveAccessByUserId(actor.id);
    if (!access?.company) {
      throw new ForbiddenException('No tenés un acceso analytics activo');
    }
    const options = await this.loadClubOptions(access.companyId);
    return {
      user: {
        id: actor.id,
        name: actor.name,
        lastName: actor.lastName,
        email: actor.email,
        role: actor.role,
      },
      access: this.serializeAccess(access, options),
      branding: {
        companyId: access.company.id,
        companyName: access.company.name,
        companyImage: access.company.image ?? null,
        primaryColor: access.company.primary_color ?? null,
        secondaryColor: access.company.secondary_color ?? null,
        showPoweredByStp: access.company.id !== getStpOperatingCompanyId(),
      },
    };
  }

  private async resolvePortalAccess(actor: User): Promise<{
    access: ClubAnalyticsTrainer;
    company: Company;
  }> {
    if (actor.role !== UserRole.TRAINER_ONLY_ANALYTICS) {
      throw new ForbiddenException('Sin acceso al portal analytics de club');
    }
    const access = await this.findActiveAccessByUserId(actor.id);
    if (!access?.company) {
      throw new ForbiddenException('No tenés un acceso analytics activo');
    }
    return { access, company: access.company };
  }

  async getPortalRoster(actor: User) {
    const { access, company } = await this.resolvePortalAccess(actor);
    const options = await this.loadClubOptions(company.id);
    const athletes = await this.divisionAnalytics.buildCompanyRoster(
      company.id,
      (_inv, user) =>
        athleteMatchesClubCode(user.clubName, access.clubCode, company.name) &&
        sexScopeMatchesAthlete(access.sexScope, user.sexo),
    );
    const overview = this.divisionAnalytics.summarizeRoster(athletes);
    return {
      clubCode: access.clubCode,
      clubLabel: this.resolveClubLabel(access.clubCode, options),
      sexScope: access.sexScope,
      sexScopeLabel: sexScopeLabel(access.sexScope),
      companyName: company.name,
      overview,
      athletes,
    };
  }

  async getPortalDashboard(actor: User) {
    const roster = await this.getPortalRoster(actor);
    const userIds = roster.athletes.map((a) => a.userId);
    const metricRows = await this.divisionAnalytics.loadMetricRowsForUsers(userIds);
    return {
      ...roster,
      metricRows,
    };
  }
}
