import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import {
  CompanyStaffMembership,
  StaffMembershipStatus,
} from 'src/entities/company-staff-membership.entity';
import { StaffShiftAssignment } from 'src/entities/staff-shift-assignment.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { InvitationStatus } from 'src/entities/athlete-invitation.entity';
import { StaffAssociationRequest } from 'src/entities/staff-association-request.entity';
import { Repository, In } from 'typeorm';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { Pagination } from 'src/common/pagination/pagination';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { AssociateTrainerDto } from './dto/associate-trainer.dto';
import { JoinCompanyDto } from './dto/join-company.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { TrainerResponseDto } from './dto/trainer-response.dto';
import { TrainerDetailResponseDto } from './dto/trainer-detail-response.dto';
import { MailingService } from '../mailer/mailing.service';
import { inviteStudentEmail, staffAssociationApprovedEmail, staffAssociationRejectedEmail, staffAssociationRequestEmail } from '../../utils/emailTemplates';
import { EncryptService } from 'src/services/bcrypt.service';
import { getStpOperatingCompanyId } from 'src/common/constants/stp-operating-company';
import { assertStpPlatformOperator } from 'src/common/helpers/company-access.helper';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';
import { UpdateCompanyModulesDto } from './dto/update-company-modules.dto';
import { UpdateCompanyAccountTypeDto } from './dto/update-company-account-type.dto';
import { isCenterCurrency, resolveCompanyCurrencies } from 'src/common/center-currencies';
import { StpPlatformBillingService } from '../stp-platform-billing/stp-platform-billing.service';

const STAFF_ROLES = [
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.DIRECTOR,
  UserRole.SECRETARIA,
];

const STAFF_ASSOCIATION_REQUEST_ROLES = [
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(StaffAssociationRequest)
    private readonly staffAssociationRequestRepository: Repository<StaffAssociationRequest>,
    @InjectRepository(CompanyStaffMembership)
    private readonly membershipRepository: Repository<CompanyStaffMembership>,
    @InjectRepository(StaffShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<StaffShiftAssignment>,
    @InjectRepository(STPSessionInstance)
    private readonly sessionRepository: Repository<STPSessionInstance>,
    private pagination: Pagination,
    private readonly mailingService: MailingService,
    private readonly encryptService: EncryptService,
    @Inject(forwardRef(() => StpPlatformBillingService))
    private readonly platformBillingService: StpPlatformBillingService,
  ) {}

  private isStaffRole(role: UserRole): boolean {
    return STAFF_ROLES.includes(role) || role === UserRole.STP_ADMIN;
  }

  private async ensureActiveMembership(
    companyId: string,
    user: User,
    actorId?: string | null,
  ): Promise<void> {
    if (!this.isStaffRole(user.role)) return;
    let row = await this.membershipRepository.findOne({
      where: { companyId, userId: user.id },
    });
    if (!row) {
      row = this.membershipRepository.create({
        companyId,
        userId: user.id,
        status: StaffMembershipStatus.ACTIVE,
        joinedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedByUserId: actorId ?? null,
        roleSnapshot: user.role,
        notes: null,
      });
    } else {
      row.status = StaffMembershipStatus.ACTIVE;
      row.statusChangedAt = new Date();
      row.statusChangedByUserId = actorId ?? null;
      row.roleSnapshot = user.role;
      row.notes = null;
    }
    await this.membershipRepository.save(row);
  }

  /** Crea membresías ACTIVE para el staff que ya está en la M2M y todavía no tiene fila. */
  private async backfillMemberships(company: Company): Promise<void> {
    const staff = (company.users ?? []).filter((u) => this.isStaffRole(u.role));
    if (staff.length === 0) return;
    const existing = await this.membershipRepository.find({
      where: { companyId: company.id, userId: In(staff.map((u) => u.id)) },
    });
    const known = new Set(existing.map((row) => row.userId));
    const missing = staff.filter((u) => !known.has(u.id));
    if (missing.length === 0) return;
    await this.membershipRepository.save(
      missing.map((u) =>
        this.membershipRepository.create({
          companyId: company.id,
          userId: u.id,
          status: StaffMembershipStatus.ACTIVE,
          joinedAt: u.created_at ?? new Date(),
          statusChangedAt: new Date(),
          roleSnapshot: u.role,
        }),
      ),
    );
  }

  private toStaffResponse(
    member: User,
    membership?: CompanyStaffMembership | null,
  ): TrainerResponseDto {
    const membershipStatus = membership?.status ?? StaffMembershipStatus.ACTIVE;
    return {
      id: member.id,
      email: member.email,
      name: member.name,
      lastName: member.lastName,
      role: member.role,
      isActive: member.isActive,
      phoneNumber: member.phoneNumber,
      country: member.country,
      city: member.city,
      imageProfile: member.imageProfile,
      associationDate: membership?.joinedAt ?? member.created_at,
      specialty: member.specialty,
      experience: member.experienceYears?.toString(),
      status: member.isActive ? 'active' : 'inactive',
      athletesCount: 0,
      membershipStatus,
      statusChangedAt: membership?.statusChangedAt ?? null,
      membershipNotes: membership?.notes ?? null,
    };
  }

  private async releaseFutureShiftAssignments(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.shiftAssignmentRepository
      .createQueryBuilder()
      .delete()
      .where('"companyId" = :companyId', { companyId })
      .andWhere('"userId" = :userId', { userId })
      .andWhere('date > :today', { today })
      .execute();
  }

  public async create(createCompanyDto: CreateCompanyDto, user: User) {
    try {
      const payload: Partial<CreateCompanyDto> = {
        name: createCompanyDto.name.trim(),
      };
      if (createCompanyDto.image?.trim()) {
        payload.image = createCompanyDto.image.trim();
      }
      if (createCompanyDto.primary_color?.trim()) {
        payload.primary_color = createCompanyDto.primary_color.trim();
      }
      if (createCompanyDto.secondary_color?.trim()) {
        payload.secondary_color = createCompanyDto.secondary_color.trim();
      }

      const currencies = resolveCompanyCurrencies({
        enabledCurrencies: createCompanyDto.enabledCurrencies,
        defaultCurrency: createCompanyDto.defaultCurrency,
      });

      const newCompany = this.companyRepository.create({
        ...payload,
        subscriptionActive: false,
        enabledCurrencies: currencies.enabledCurrencies,
        defaultCurrency: currencies.defaultCurrency,
        ...(createCompanyDto.accountType ? { accountType: createCompanyDto.accountType } : {}),
      });
      const customTemporaryPassword = createCompanyDto.temporaryPassword?.trim();
      newCompany.temporaryPassword = customTemporaryPassword || null;
      newCompany.users = [user];
      const saved = await this.companyRepository.save(newCompany);
      await this.ensureActiveMembership(saved.id, user, user.id);
      return saved;
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('COMPANY_HAS_BEEN_REGISTERED');
      }
      throw new InternalServerErrorException();
    }
  }

  public async findAll(
    offset: number,
    limit: number,
    path: string,
  ): Promise<PaginatedListDto<Company>> {
    const [companies, count] = await this.companyRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        name: 'ASC',
      },
    });
    return new PaginatedListDto(
      companies,
      this.pagination.buildPaginationDto(limit, offset, count, path),
    );
  }

  public async findOne(id: string): Promise<Company> {
    return await this.companyRepository.findOneBy({ id });
  }

  public async findCompaniesByUser(userId: string): Promise<Company[]> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return [];
      }

      if (user.role === UserRole.STP_ADMIN) {
        const operating = await this.getOperatingCompany();
        return operating ? [operating] : [];
      }

      return await this.companyRepository
        .createQueryBuilder('company')
        .innerJoin('company.users', 'user')
        .where('user.id = :userId', { userId })
        .andWhere('user.role IN (:...roles)', {
          roles: [
            UserRole.TRAINER,
            UserRole.DIRECTOR,
            UserRole.SECRETARIA,
            UserRole.SUB_TRAINER,
            UserRole.STP_ADMIN,
          ],
        })
        .orderBy('company.created_at', 'ASC')
        .getMany()
        .then(async (companies) => {
          if (companies.length === 0) return companies;
          const memberships = await this.membershipRepository.find({
            where: { userId },
          });
          const statusByCompany = new Map(
            memberships.map((row) => [row.companyId, row.status]),
          );
          return companies.filter((company) => {
            const status = statusByCompany.get(company.id);
            return status == null || status === StaffMembershipStatus.ACTIVE;
          });
        });
    } catch (error) {
      Logger.log('Have an error in get all companies by user', error)
      return []
    }
  }

  public async getOperatingCompany(): Promise<Company | null> {
    const id = getStpOperatingCompanyId();
    return this.companyRepository.findOne({ where: { id } });
  }

  public async assertCanManagePlatformCompanies(user: User): Promise<void> {
    await assertStpPlatformOperator(user, this.companyRepository);
  }

  public async listCompaniesForAdmin(
    offset: number,
    limit: number,
    path: string,
    options?: {
      active?: boolean;
      search?: string;
      accountType?: string;
      plan?: string;
      billingKind?: string;
      due?: 'overdue' | 'upcoming';
    },
  ): Promise<PaginatedListDto<unknown>> {
    const qb = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.users', 'users')
      .orderBy('company.created_at', 'DESC');

    if (options?.active === true) {
      qb.andWhere('company.subscription_active = :active', { active: true });
    } else if (options?.active === false) {
      qb.andWhere('company.subscription_active = :active', { active: false });
    }

    if (options?.search?.trim()) {
      qb.andWhere('LOWER(company.name) LIKE LOWER(:search)', {
        search: `%${options.search.trim()}%`,
      });
    }

    if (options?.accountType?.trim()) {
      qb.andWhere('company.account_type = :accountType', {
        accountType: options.accountType.trim(),
      });
    }

    const [planIds, dueIds] = await Promise.all([
      this.platformBillingService.filterCompanyIdsByPlan(
        options?.plan,
        options?.billingKind,
      ),
      this.platformBillingService.filterCompanyIdsByDue(options?.due),
    ]);

    if (planIds) {
      if (planIds.length === 0) {
        return new PaginatedListDto(
          [],
          this.pagination.buildPaginationDto(limit, offset, 0, path),
        );
      }
      qb.andWhere('company.id IN (:...planIds)', { planIds });
    }
    if (dueIds) {
      if (dueIds.length === 0) {
        return new PaginatedListDto(
          [],
          this.pagination.buildPaginationDto(limit, offset, 0, path),
        );
      }
      qb.andWhere('company.id IN (:...dueIds)', { dueIds });
    }

    const [companies, count] = await qb.skip(offset).take(limit).getManyAndCount();
    const companyIds = companies.map((c) => c.id);
    const [subMap, chargeMap] = await Promise.all([
      this.platformBillingService.getActiveSubscriptionMap(companyIds),
      this.platformBillingService.getChargeSummaryMap(companyIds),
    ]);

    const items = companies.map((company) => {
      const directors = (company.users ?? []).filter(
        (u) => u.role === UserRole.DIRECTOR || u.role === UserRole.STP_ADMIN,
      );
      const staffCount = (company.users ?? []).filter((u) =>
        STAFF_ROLES.includes(u.role),
      ).length;
      const platformSub = subMap.get(company.id) ?? null;
      const chargeSummary = chargeMap.get(company.id) ?? null;

      return {
        id: company.id,
        name: company.name,
        subscriptionActive: company.subscriptionActive,
        accountType: company.accountType,
        enabledModules: company.enabledModules ?? null,
        createdAt: company.created_at,
        directors: directors.map((d) => ({
          id: d.id,
          name: d.name,
          lastName: d.lastName,
          email: d.email,
          phoneNumber: d.phoneNumber != null ? String(d.phoneNumber) : null,
        })),
        staffCount,
        platformSubscription: platformSub
          ? {
              id: platformSub.id,
              plan: platformSub.plan,
              billingKind: platformSub.billingKind,
              status: platformSub.status,
              subscriptionAmount:
                platformSub.subscriptionAmount == null
                  ? null
                  : Number(platformSub.subscriptionAmount),
              currency: platformSub.currency,
              periodStart: platformSub.periodStart,
              periodEnd: platformSub.periodEnd,
              notes: platformSub.notes,
            }
          : null,
        platformBilling: chargeSummary
          ? {
              pendingSubscription: chargeSummary.pendingSubscription,
              pendingOnboarding: chargeSummary.pendingOnboarding,
              onboardingPaid: chargeSummary.onboardingPaid,
              overdue: chargeSummary.overdue,
              lastPaidAt: chargeSummary.lastPaidAt,
              lastPaidAmount: chargeSummary.lastPaidAmount,
              lastPaidCurrency: chargeSummary.lastPaidCurrency,
            }
          : null,
      };
    });

    return new PaginatedListDto(
      items,
      this.pagination.buildPaginationDto(limit, offset, count, path),
    );
  }

  public async setCompanySubscriptionActive(
    companyId: string,
    dto: UpdateCompanySubscriptionDto,
    admin: User,
  ): Promise<Company> {
    await assertStpPlatformOperator(admin, this.companyRepository);

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    company.subscriptionActive = dto.subscriptionActive;
    return this.companyRepository.save(company);
  }

  public async setCompanyEnabledModules(
    companyId: string,
    dto: UpdateCompanyModulesDto,
    admin: User,
  ): Promise<Company> {
    await assertStpPlatformOperator(admin, this.companyRepository);

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    company.enabledModules =
      dto.enabledModules.length > 0 ? [...dto.enabledModules] : null;
    return this.companyRepository.save(company);
  }

  public async setCompanyAccountType(
    companyId: string,
    dto: UpdateCompanyAccountTypeDto,
    admin: User,
  ): Promise<Company> {
    await assertStpPlatformOperator(admin, this.companyRepository);

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    company.accountType = dto.accountType;
    return this.companyRepository.save(company);
  }

  public async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (updateCompanyDto.name !== undefined) {
      company.name = updateCompanyDto.name.trim();
    }
    if (updateCompanyDto.image !== undefined) {
      company.image = updateCompanyDto.image || null;
    }
    if (updateCompanyDto.primary_color !== undefined) {
      company.primary_color = updateCompanyDto.primary_color || null;
    }
    if (updateCompanyDto.secondary_color !== undefined) {
      company.secondary_color = updateCompanyDto.secondary_color || null;
    }
    if (updateCompanyDto.accountType !== undefined) {
      company.accountType = updateCompanyDto.accountType;
    }

    if (
      updateCompanyDto.enabledCurrencies !== undefined ||
      updateCompanyDto.defaultCurrency !== undefined
    ) {
      const requestedEnabled =
        updateCompanyDto.enabledCurrencies ?? company.enabledCurrencies;
      const requestedDefault =
        updateCompanyDto.defaultCurrency ?? company.defaultCurrency;
      const unique = [...new Set((requestedEnabled ?? []).filter(isCenterCurrency))];
      if (unique.length === 0) {
        throw new BadRequestException('Debés habilitar al menos una moneda');
      }
      if (
        requestedDefault &&
        isCenterCurrency(requestedDefault) &&
        !unique.includes(requestedDefault)
      ) {
        throw new BadRequestException('La moneda predeterminada debe estar habilitada');
      }
      const resolved = resolveCompanyCurrencies({
        enabledCurrencies: unique,
        defaultCurrency: requestedDefault,
      });
      company.enabledCurrencies = resolved.enabledCurrencies;
      company.defaultCurrency = resolved.defaultCurrency;
    }

    if (updateCompanyDto.temporaryPassword !== undefined) {
      const customTemporaryPassword = updateCompanyDto.temporaryPassword?.trim();
      company.temporaryPassword = customTemporaryPassword || null;
    }

    return this.companyRepository.save(company);
  }

  public async remove(id: string): Promise<string> {
    try {
      await this.companyRepository.softDelete(id);
      return `The company ${id} was deleted`;
    } catch (error) {
      Logger.log(`Error to delete company ${id}`, error);
    }
  }

  // Métodos para asociar entrenadores
  public async associateTrainer(
    companyId: string,
    directorId: string,
    associateTrainerDto: AssociateTrainerDto,
  ): Promise<any> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que el director tiene permisos para esta empresa
    const director = company.users.find(user => 
      user.id === directorId && 
      (user.role === UserRole.DIRECTOR || user.role === UserRole.STP_ADMIN)
    );

    if (!director) {
      throw new ForbiddenException('Only directors can associate trainers to companies');
    }

    // Buscar el entrenador por email
    const trainer = await this.userRepository.findOne({
      where: { email: associateTrainerDto.trainerEmail },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found with the provided email');
    }

    // Verificar que el usuario es un entrenador
    if (trainer.role !== UserRole.TRAINER && trainer.role !== UserRole.SUB_TRAINER) {
      throw new BadRequestException('User is not a trainer');
    }

    // Verificar que el entrenador no esté ya asociado a esta empresa
    const isAlreadyAssociated = company.users.some(user => user.id === trainer.id);
    if (isAlreadyAssociated) {
      throw new ConflictException('Trainer is already associated with this company');
    }

    // Asociar el entrenador a la empresa
    company.users.push(trainer);
    await this.companyRepository.save(company);
    await this.ensureActiveMembership(company.id, trainer, directorId);

    return {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      companyId: company.id,
      companyName: company.name,
      associationDate: new Date(),
    };
  }

  public async getCompanyTrainers(companyId: string, directorId: string): Promise<any[]> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que el director tiene permisos para esta empresa
    const director = company.users.find(user => 
      user.id === directorId && 
      (user.role === UserRole.DIRECTOR || user.role === UserRole.STP_ADMIN)
    );

    if (!director) {
      throw new ForbiddenException('Only directors can view company trainers');
    }

    // Filtrar solo entrenadores
    const trainers = company.users.filter(user => 
      user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER
    );

    return trainers.map(trainer => ({
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      companyId: company.id,
      companyName: company.name,
    }));
  }

  public async removeTrainerFromCompany(
    companyId: string,
    directorId: string,
    trainerId: string,
  ): Promise<void> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que el director tiene permisos para esta empresa
    const director = company.users.find(user => 
      user.id === directorId && 
      (user.role === UserRole.DIRECTOR || user.role === UserRole.STP_ADMIN)
    );

    if (!director) {
      throw new ForbiddenException('Only directors can remove staff from companies');
    }

    // Verificar que el miembro existe en la empresa (cualquier rol de staff)
    const staffMember = company.users.find(user => 
      user.id === trainerId && STAFF_ROLES.includes(user.role)
    );

    if (!staffMember) {
      throw new NotFoundException('Miembro del equipo no encontrado en este centro');
    }

    // Remover el acceso operativo y conservar el registro (desactivar).
    await this.setStaffMembershipStatus(
      companyId,
      directorId,
      trainerId,
      StaffMembershipStatus.INACTIVE,
    );
  }

  public async searchAvailableTrainers(searchTerm: string): Promise<any[]> {
    // Buscar entrenadores que no estén asociados a ninguna empresa
    const trainers = await this.userRepository.find({
      where: {
        role: In([UserRole.TRAINER, UserRole.SUB_TRAINER]),
        email: searchTerm ? searchTerm : undefined,
      },
      relations: ['company'],
    });

    // Filtrar solo los que no están asociados a ninguna empresa
    const availableTrainers = trainers.filter(trainer => 
      !trainer.company || trainer.company.length === 0
    );

    return availableTrainers.map(trainer => ({
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
    }));
  }

  // Método para que entrenadores se unan directamente a un centro
  public async joinCompanyAsTrainer(
    companyId: string,
    joinCompanyDto: JoinCompanyDto,
  ): Promise<any> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que la empresa está activa
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Buscar el entrenador por email
    const trainer = await this.userRepository.findOne({
      where: { email: joinCompanyDto.trainerEmail },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found with the provided email');
    }

    // Verificar que el usuario es un entrenador
    if (trainer.role !== UserRole.TRAINER && trainer.role !== UserRole.SUB_TRAINER) {
      throw new BadRequestException('User is not a trainer');
    }

    // Verificar que el entrenador está activo
    if (!trainer.isActive) {
      throw new BadRequestException('Trainer account is not active');
    }

    // Verificar que el entrenador no esté ya asociado a esta empresa
    const isAlreadyAssociated = company.users.some(user => user.id === trainer.id);
    if (isAlreadyAssociated) {
      throw new ConflictException('Trainer is already associated with this company');
    }

    // Verificar que el entrenador no esté asociado a otra empresa
    const trainerCompanies = await this.companyRepository.find({
      where: {
        users: {
          id: trainer.id,
        },
      },
    });

    if (trainerCompanies.length > 0) {
      throw new ConflictException('Trainer is already associated with another company');
    }

    // Asociar el entrenador a la empresa
    company.users.push(trainer);
    await this.companyRepository.save(company);
    await this.ensureActiveMembership(company.id, trainer, trainer.id);

    return {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      companyId: company.id,
      companyName: company.name,
      associationDate: new Date(),
      message: 'Successfully joined the company',
    };
  }

  // Método para obtener información pública del centro
  public async getCompanyPublicInfo(companyId: string): Promise<any> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Contar entrenadores asociados
    const trainersCount = company.users.filter(user => 
      user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER
    ).length;

    // Contar directores
    const directorsCount = company.users.filter(user => 
      user.role === UserRole.DIRECTOR
    ).length;

    return {
      id: company.id,
      name: company.name,
      image: company.image,
      primaryColor: company.primary_color,
      secondaryColor: company.secondary_color,
      trainersCount,
      directorsCount,
      isActive: !company.isDelete,
      subscriptionActive: company.subscriptionActive,
    };
  }

  public async getCompanyPublicBySlug(slug: string): Promise<any> {
    const normalizedSlug = slug?.trim().toLowerCase();
    if (!normalizedSlug) {
      throw new BadRequestException('Slug is required');
    }

    const company = await this.companyRepository.findOne({
      where: { slug: normalizedSlug },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      image: company.image,
      primaryColor: company.primary_color,
      secondaryColor: company.secondary_color,
      subscriptionActive: company.subscriptionActive,
    };
  }

  // Método para obtener todo el personal del centro (entrenadores, directores, secretarias)
  public async getAllCompanyTrainers(
    companyId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'all' = 'ACTIVE',
  ): Promise<TrainerResponseDto[]> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    await this.backfillMemberships(company);

    const memberships = await this.membershipRepository.find({
      where: { companyId },
    });
    const filtered = memberships.filter((row) =>
      status === 'all' ? true : row.status === status,
    );
    if (filtered.length === 0) return [];

    const users = await this.userRepository.find({
      where: { id: In(filtered.map((row) => row.userId)) },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return filtered
      .map((row) => {
        const member = byId.get(row.userId);
        if (!member || !this.isStaffRole(member.role)) return null;
        return this.toStaffResponse(member, row);
      })
      .filter((row): row is TrainerResponseDto => !!row)
      .sort((a, b) =>
        `${a.name} ${a.lastName}`.localeCompare(`${b.name} ${b.lastName}`, 'es'),
      );
  }

  public async setStaffMembershipStatus(
    companyId: string,
    actorId: string,
    staffId: string,
    status: StaffMembershipStatus,
    notes?: string,
  ): Promise<TrainerResponseDto> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) throw new NotFoundException('Company not found');

    await this.backfillMemberships(company);

    const actor = company.users.find(
      (user) =>
        user.id === actorId &&
        (user.role === UserRole.DIRECTOR || user.role === UserRole.STP_ADMIN),
    );
    if (!actor) {
      throw new ForbiddenException('Solo un director puede cambiar el estado del equipo');
    }

    const target = await this.userRepository.findOne({ where: { id: staffId } });
    if (!target || !this.isStaffRole(target.role)) {
      throw new NotFoundException('Miembro del equipo no encontrado');
    }

    const membership = await this.membershipRepository.findOne({
      where: { companyId, userId: staffId },
    });
    if (!membership) {
      throw new NotFoundException('Miembro del equipo no encontrado en este centro');
    }

    if (
      status === StaffMembershipStatus.INACTIVE &&
      target.role === UserRole.DIRECTOR
    ) {
      const activeRows = await this.membershipRepository.find({
        where: { companyId, status: StaffMembershipStatus.ACTIVE },
      });
      const activeUsers = activeRows.length
        ? await this.userRepository.find({
            where: { id: In(activeRows.map((row) => row.userId)) },
          })
        : [];
      const otherDirectors = activeUsers.filter(
        (user) => user.role === UserRole.DIRECTOR && user.id !== staffId,
      );
      if (otherDirectors.length === 0) {
        throw new BadRequestException(
          'No se puede desactivar al único director del centro',
        );
      }
    }

    membership.status = status;
    membership.statusChangedAt = new Date();
    membership.statusChangedByUserId = actorId;
    membership.roleSnapshot = target.role;
    if (notes !== undefined) {
      membership.notes = notes.trim() || null;
    }
    await this.membershipRepository.save(membership);

    const inCompany = company.users.some((user) => user.id === staffId);
    if (status === StaffMembershipStatus.ACTIVE) {
      if (!inCompany) {
        company.users.push(target);
        await this.companyRepository.save(company);
      }
    } else {
      if (inCompany) {
        company.users = company.users.filter((user) => user.id !== staffId);
        await this.companyRepository.save(company);
      }
      await this.releaseFutureShiftAssignments(companyId, staffId);
    }

    return this.toStaffResponse(target, membership);
  }

  public async getTrainerProductivityStats(
    companyId: string,
    actorId: string,
    from: string,
    to: string,
    userId?: string,
  ) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) throw new NotFoundException('Company not found');

    const actor = company.users.find(
      (user) =>
        user.id === actorId &&
        (user.role === UserRole.DIRECTOR ||
          user.role === UserRole.STP_ADMIN ||
          user.role === UserRole.SECRETARIA),
    );
    if (!actor) {
      throw new ForbiddenException('No tenés permiso para ver estas estadísticas');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    await this.backfillMemberships(company);
    const memberships = await this.membershipRepository.find({ where: { companyId } });
    const scoped = userId
      ? memberships.filter((row) => row.userId === userId)
      : memberships;
    if (scoped.length === 0) {
      return {
        from,
        to,
        feedbackPending: 0,
        athletesWithoutRecentPlan: 0,
        rows: [],
      };
    }

    const users = await this.userRepository.find({
      where: { id: In(scoped.map((row) => row.userId)) },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const assignments = await this.shiftAssignmentRepository
      .createQueryBuilder('a')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.date BETWEEN :from AND :to', { from, to })
      .getMany();

    const hoursByUser = new Map<string, number>();
    for (const assignment of assignments) {
      const hours = (assignment.durationMinutes || 60) / 60;
      hoursByUser.set(
        assignment.userId,
        (hoursByUser.get(assignment.userId) ?? 0) + hours,
      );
    }

    const athleteIds = (company.users ?? [])
      .filter((user) => user.role === UserRole.ATHLETE)
      .map((user) => user.id);

    const sessions = athleteIds.length
      ? await this.sessionRepository
          .createQueryBuilder('s')
          .where('s.athlete_id IN (:...athleteIds)', { athleteIds })
          .andWhere(
            `(
              (s.created_at BETWEEN :fromDate AND :toDate)
              OR (s.updated_at BETWEEN :fromDate AND :toDate)
              OR (s.attendance_marked_at BETWEEN :fromDate AND :toDate)
            )`,
            { fromDate, toDate },
          )
          .getMany()
      : [];

    const createdByUser = new Map<string, number>();
    const editedByUser = new Map<string, number>();
    const publishedByUser = new Map<string, number>();
    const attendanceByUser = new Map<string, number>();
    let feedbackPending = 0;

    if (athleteIds.length) {
      feedbackPending = await this.sessionRepository
        .createQueryBuilder('s')
        .where('s.athleteId IN (:...athleteIds)', { athleteIds })
        .andWhere("s.feedback_status = 'pending_review'")
        .getCount();
    }

    for (const session of sessions) {
      const createdInRange =
        session.createdAt >= fromDate && session.createdAt <= toDate;
      const updatedInRange =
        session.updatedAt >= fromDate && session.updatedAt <= toDate;
      if (createdInRange && session.createdByUserId) {
        createdByUser.set(
          session.createdByUserId,
          (createdByUser.get(session.createdByUserId) ?? 0) + 1,
        );
      }
      if (updatedInRange && session.lastSavedByUserId) {
        editedByUser.set(
          session.lastSavedByUserId,
          (editedByUser.get(session.lastSavedByUserId) ?? 0) + 1,
        );
      }
      if (
        session.coachStatus === 'published' &&
        updatedInRange &&
        (session.createdByUserId || session.lastSavedByUserId)
      ) {
        const publisher = session.lastSavedByUserId || session.createdByUserId;
        if (publisher) {
          publishedByUser.set(publisher, (publishedByUser.get(publisher) ?? 0) + 1);
        }
      }
      if (
        session.attendanceSource === 'coach' &&
        session.attendanceMarkedByUserId &&
        session.attendanceMarkedAt &&
        session.attendanceMarkedAt >= fromDate &&
        session.attendanceMarkedAt <= toDate
      ) {
        attendanceByUser.set(
          session.attendanceMarkedByUserId,
          (attendanceByUser.get(session.attendanceMarkedByUserId) ?? 0) + 1,
        );
      }
    }

    const threshold = new Date();
    threshold.setUTCDate(threshold.getUTCDate() - 7);
    const thresholdStr = threshold.toISOString().slice(0, 10);
    let athletesWithoutRecentPlan = 0;
    if (athleteIds.length) {
      const planned = await this.sessionRepository
        .createQueryBuilder('s')
        .select('s.athlete_id', 'athleteId')
        .where('s.athlete_id IN (:...athleteIds)', { athleteIds })
        .andWhere('s.scheduled_date >= :thresholdStr', { thresholdStr })
        .andWhere(
          "(jsonb_array_length(COALESCE(s.blocks, '[]'::jsonb)) > 0 OR s.template_id = 'libre')",
        )
        .groupBy('s.athlete_id')
        .getRawMany();
      const plannedIds = new Set(planned.map((row) => row.athleteId as string));
      athletesWithoutRecentPlan = athleteIds.filter((id) => !plannedIds.has(id)).length;
    }

    const bump = (map: Map<string, number>, id: string) => map.get(id) ?? 0;

    const rows = scoped
      .map((membership) => {
        const member = userById.get(membership.userId);
        if (!member) return null;
        return {
          userId: member.id,
          name: `${member.name} ${member.lastName}`.trim(),
          role: member.role,
          membershipStatus: membership.status,
          plannedHours: Math.round((hoursByUser.get(member.id) ?? 0) * 10) / 10,
          sessionsCreated: bump(createdByUser, member.id),
          sessionsEdited: bump(editedByUser, member.id),
          sessionsPublished: bump(publishedByUser, member.id),
          attendancesMarked: bump(attendanceByUser, member.id),
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row)
      .sort((a, b) => b.plannedHours - a.plannedHours || a.name.localeCompare(b.name, 'es'));

    return {
      from,
      to,
      feedbackPending,
      athletesWithoutRecentPlan,
      rows,
    };
  }

  // Método para añadir un miembro del equipo al centro (con rol)
  public async addStaffToCompany(
    companyId: string,
    addStaffDto: AddStaffDto,
  ): Promise<TrainerResponseDto> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    let user = await this.userRepository.findOne({
      where: { email: addStaffDto.email },
    });

    if (user) {
      // Usuario existente: asociar al centro y actualizar rol si es staff
      const isAlreadyInCompany = company.users.some(u => u.id === user.id);
      if (isAlreadyInCompany) {
        throw new ConflictException('Este usuario ya pertenece al centro');
      }

      if (user.role === UserRole.ATHLETE) {
        throw new BadRequestException('No se puede agregar un atleta como miembro del equipo. Use la sección de atletas.');
      }

      let shouldSaveUser = false;
      if (user.isActive !== true) {
        user.isActive = true;
        shouldSaveUser = true;
      }

      // Actualizar rol si el nuevo rol es diferente y es un rol de staff
      if (STAFF_ROLES.includes(addStaffDto.role) && user.role !== addStaffDto.role) {
        user.role = addStaffDto.role;
        if (addStaffDto.specialty && (user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER)) {
          user.specialty = addStaffDto.specialty;
        }
        if (addStaffDto.experience && (user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER)) {
          user.experienceYears = parseInt(addStaffDto.experience, 10) || undefined;
        }
        if (addStaffDto.phone) {
          user.phoneNumber = parseInt(addStaffDto.phone.replace(/\D/g, ''), 10) || user.phoneNumber;
        }
        shouldSaveUser = true;
      }

      if (shouldSaveUser) {
        await this.userRepository.save(user);
      }

      company.users.push(user);
      await this.companyRepository.save(company);
      await this.ensureActiveMembership(company.id, user);

      return this.toStaffResponse(user);
    }

    // Usuario nuevo: crear y asociar (requiere contraseña)
    if (!addStaffDto.password || addStaffDto.password.length < 8) {
      throw new BadRequestException('Para crear un nuevo usuario se requiere una contraseña de al menos 8 caracteres');
    }

    const passwordEncrypted = await this.encryptService.encryptedData(addStaffDto.password);
    const newUser = this.userRepository.create({
      name: addStaffDto.name,
      lastName: addStaffDto.lastName,
      email: addStaffDto.email,
      password: passwordEncrypted,
      role: addStaffDto.role,
      phoneNumber: addStaffDto.phone ? parseInt(addStaffDto.phone.replace(/\D/g, ''), 10) : undefined,
      specialty: addStaffDto.specialty,
      experienceYears: addStaffDto.experience ? parseInt(addStaffDto.experience, 10) : undefined,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(newUser);
    company.users.push(savedUser);
    await this.companyRepository.save(company);
    await this.ensureActiveMembership(company.id, savedUser);

    return this.toStaffResponse(savedUser);
  }

  // Método para actualizar el rol de un miembro del equipo
  public async updateStaffRole(
    companyId: string,
    staffId: string,
    newRole: UserRole.TRAINER | UserRole.SUB_TRAINER | UserRole.DIRECTOR | UserRole.SECRETARIA,
  ): Promise<TrainerResponseDto> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const staffMember = company.users.find(
      u => u.id === staffId && STAFF_ROLES.includes(u.role),
    );

    if (!staffMember) {
      throw new NotFoundException('Miembro del equipo no encontrado en este centro');
    }

    if (!STAFF_ROLES.includes(newRole)) {
      throw new BadRequestException('Rol inválido');
    }

    staffMember.role = newRole;
    await this.userRepository.save(staffMember);

    return {
      id: staffMember.id,
      email: staffMember.email,
      name: staffMember.name,
      lastName: staffMember.lastName,
      role: staffMember.role,
      isActive: staffMember.isActive,
      phoneNumber: staffMember.phoneNumber,
      country: staffMember.country,
      city: staffMember.city,
      imageProfile: staffMember.imageProfile,
      associationDate: staffMember.created_at,
    };
  }

  // Método para obtener todos los alumnos de un centro
  public async getAllCompanyStudents(companyId: string): Promise<any[]> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que la empresa está activa
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Filtrar solo alumnos (ATHLETE)
    const students = company.users.filter(user => 
      user.role === UserRole.ATHLETE
    );

    // Mapear a DTO de respuesta
    return students.map(student => ({
      id: student.id,
      email: student.email,
      name: student.name,
      lastName: student.lastName,
      role: student.role,
      isActive: student.isActive,
      phoneNumber: student.phoneNumber,
      country: student.country,
      city: student.city,
      imageProfile: student.imageProfile,
      enrollmentDate: student.created_at, // Usar fecha de creación como fecha de inscripción
    }));
  }

  // Método para invitar un alumno al centro por email
  public async inviteStudentToCompany(
    companyId: string, 
    studentEmail: string,
    directorId: string
  ): Promise<any> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que el director tiene permisos
    const director = company.users.find(user => user.id === directorId);
    if (!director || (director.role !== UserRole.DIRECTOR)) {
      throw new ForbiddenException('Only directors can invite students');
    }

    // Buscar al alumno por email
    const student = await this.userRepository.findOne({
      where: { email: studentEmail },
    });

    if (!student) {
      throw new NotFoundException('Student not found with the provided email');
    }

    // Verificar que el usuario es un alumno
    if (student.role !== UserRole.ATHLETE) {
      throw new BadRequestException('User is not a student (ATHLETE)');
    }

    // Verificar que el alumno no esté ya asociado a esta empresa
    const isAlreadyAssociated = company.users.some(user => user.id === student.id);
    if (isAlreadyAssociated) {
      throw new ConflictException('Student is already associated with this company');
    }

    // Verificar que el alumno no esté asociado a otra empresa
    const studentCompanies = await this.companyRepository.find({
      where: {
        users: {
          id: student.id,
        },
      },
    });

    if (studentCompanies.length > 0) {
      throw new ConflictException('Student is already associated with another company');
    }

    // Crear URL para que el alumno acepte la invitación
    const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/company/${companyId}/accept-invitation`;

    try {
      // Generar template de email de invitación
      const mail = inviteStudentEmail(
        student.email,
        student.name,
        company.name,
        joinUrl,
        process.env.RESEND_FROM_EMAIL || 'noreply@stp.com'
      );

      // Enviar email de invitación
      await this.mailingService.sendMail(mail);

      return {
        message: 'Student invited successfully and email sent',
        student: {
          id: student.id,
          email: student.email,
          name: student.name,
          lastName: student.lastName,
          companyName: company.name
        },
        joinUrl
      };
    } catch (error) {
      // Log error pero seguir con el proceso (invitation continua)
      console.error('Error sending invitation email:', error);
      return {
        message: 'Student invited successfully but email failed to send',
        student: {
          id: student.id,
          email: student.email,
          name: student.name,
          lastName: student.lastName,
          companyName: company.name
        },
        joinUrl,
        emailError: 'Email delivery failed',
      };
    }
  }

  // Método para que un alumno acepte la invitación (join company)
  public async joinCompanyAsStudent(
    companyId: string,
    studentEmail: string,
  ): Promise<any> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Buscar al alumno por email
    const student = await this.userRepository.findOne({
      where: { email: studentEmail },
    });

    if (!student) {
      throw new NotFoundException('Student not found with the provided email');
    }

    // Verificar que es un alumno
    if (student.role !== UserRole.ATHLETE) {
      throw new BadRequestException('User is not a student (ATHLETE)');
    }

    // Verificar que el alumno no esté ya asociado a esta empresa
    const isAlreadyAssociated = company.users.some(user => user.id === student.id);
    if (isAlreadyAssociated) {
      throw new ConflictException('Student is already associated with this company');
    }

    // Asociar el alumno a la empresa
    company.users.push(student);
    await this.companyRepository.save(company);

    return {
      message: 'Student joined the company successfully',
      student: {
        id: student.id,
        email: student.email,
        name: student.name,
        lastName: student.lastName,
        companyName: company.name
      }
    };
  }

  // Método para obtener entrenadores con paginación
  public async getCompanyTrainersPaginated(
    companyId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ trainers: TrainerResponseDto[]; total: number; page: number; totalPages: number }> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que la empresa está activa
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Filtrar solo entrenadores
    const allTrainers = company.users.filter(user => 
      user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER
    );

    // Calcular paginación
    const total = allTrainers.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTrainers = allTrainers.slice(startIndex, endIndex);

    // Mapear a DTO de respuesta
    const trainers = paginatedTrainers.map(trainer => ({
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      phoneNumber: trainer.phoneNumber,
      country: trainer.country,
      city: trainer.city,
      imageProfile: trainer.imageProfile,
      associationDate: trainer.created_at,
    }));

    return {
      trainers,
      total,
      page,
      totalPages,
    };
  }

  // Método para obtener alumnos del centro con paginación
  public async getCompanyStudentsPaginated(
    companyId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ students: any[]; total: number; page: number; totalPages: number }> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que la empresa está activa
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Filtrar solo alumnos (ATHLETE)
    const allStudents = company.users.filter(user => 
      user.role === UserRole.ATHLETE
    );

    // Calcular paginación
    const total = allStudents.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStudents = allStudents.slice(startIndex, endIndex);

    // Mapear a DTO de respuesta
    const students = paginatedStudents.map(student => ({
      id: student.id,
      email: student.email,
      name: student.name,
      lastName: student.lastName,
      role: student.role,
      isActive: student.isActive,
      phoneNumber: student.phoneNumber,
      country: student.country,
      city: student.city,
      imageProfile: student.imageProfile,
      enrollmentDate: student.created_at, // Fecha de inscripción
    }));

    return {
      students,
      total,
      page,
      totalPages,
    };
  }

  // Método para buscar entrenadores dentro del centro
  public async searchCompanyTrainers(
    companyId: string,
    searchTerm: string,
  ): Promise<TrainerResponseDto[]> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que la empresa está activa
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Filtrar entrenadores y aplicar búsqueda
    const trainers = company.users.filter(user => {
      const isTrainer = user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER;
      if (!isTrainer) return false;

      // Búsqueda por nombre, apellido o email
      const searchLower = searchTerm.toLowerCase();
      return (
        user.name.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    });

    // Mapear a DTO de respuesta
    return trainers.map(trainer => ({
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      phoneNumber: trainer.phoneNumber,
      country: trainer.country,
      city: trainer.city,
      imageProfile: trainer.imageProfile,
      associationDate: trainer.created_at,
    }));
  }

  // Método para obtener información detallada de un miembro del equipo (entrenador, director, secretaria)
  public async getTrainerDetail(
    companyId: string,
    trainerId: string,
  ): Promise<TrainerDetailResponseDto> {
    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar que la empresa está activa
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    // Buscar el miembro del equipo en la empresa (cualquier rol de staff)
    const member = company.users.find(user => 
      user.id === trainerId && STAFF_ROLES.includes(user.role)
    );

    if (!member) {
      throw new NotFoundException('Miembro del equipo no encontrado en este centro');
    }

    return {
      id: member.id,
      email: member.email,
      name: member.name,
      lastName: member.lastName,
      role: member.role,
      isActive: member.isActive,
      phoneNumber: member.phoneNumber,
      country: member.country,
      city: member.city,
      imageProfile: member.imageProfile,
      associationDate: member.created_at,
      companyId: company.id,
      companyName: company.name,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    };
  }

  // Método para obtener información de cualquier entrenador (sin restricción de empresa)
  public async getAnyTrainerDetail(trainerId: string): Promise<any> {
    const trainer = await this.userRepository.findOne({
      where: { 
        id: trainerId,
        role: In([UserRole.TRAINER, UserRole.SUB_TRAINER])
      },
      relations: ['company'],
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    return {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      phoneNumber: trainer.phoneNumber,
      country: trainer.country,
      city: trainer.city,
      imageProfile: trainer.imageProfile,
      createdAt: trainer.created_at,
      updatedAt: trainer.updated_at,
      companies: trainer.company || [],
    };
  }

  private async assertDirectorCanManageCompany(
    companyId: string,
    actorId: string,
  ): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    const actor = await this.userRepository.findOne({ where: { id: actorId } });
    if (!actor) {
      throw new ForbiddenException('Usuario no autorizado');
    }
    if (actor.role === UserRole.STP_ADMIN) {
      return company;
    }
    const isDirector = company.users.some(
      (u) => u.id === actorId && u.role === UserRole.DIRECTOR,
    );
    if (!isDirector) {
      throw new ForbiddenException(
        'Only directors can manage staff association requests',
      );
    }
    return company;
  }

  public async requestStaffAssociation(
    companyId: string,
    user: User,
    message?: string,
  ): Promise<StaffAssociationRequest> {
    if (!STAFF_ASSOCIATION_REQUEST_ROLES.includes(user.role)) {
      throw new BadRequestException(
        'Solo entrenadores y secretarias pueden solicitar asociación a un centro',
      );
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    if (company.isDelete) {
      throw new BadRequestException('Company is not active');
    }

    const alreadyMember = company.users.some((u) => u.id === user.id);
    if (alreadyMember) {
      throw new ConflictException('Ya estás asociado a este centro');
    }

    const otherCompanies = await this.findCompaniesByUser(user.id);
    if (otherCompanies.length > 0) {
      throw new ConflictException(
        'Ya estás asociado a otro centro. Debes desvincularte antes de solicitar uno nuevo.',
      );
    }

    const existing = await this.staffAssociationRequestRepository.findOne({
      where: {
        user: { id: user.id },
        company: { id: companyId },
      },
    });

    if (existing) {
      if (existing.status === InvitationStatus.PENDING) {
        throw new ConflictException(
          'Ya tienes una solicitud pendiente para este centro',
        );
      }
      if (existing.status === InvitationStatus.APPROVED) {
        throw new ConflictException('Ya estás asociado a este centro');
      }
      existing.status = InvitationStatus.PENDING;
      existing.message = message ?? null;
      existing.companyResponse = null;
      existing.approvedAt = null;
      existing.rejectedAt = null;
      const saved = await this.staffAssociationRequestRepository.save(existing);
      await this.notifyDirectorsOfStaffAssociationRequest(company, user, message);
      return saved;
    }

    const request = this.staffAssociationRequestRepository.create({
      user: { id: user.id },
      company: { id: companyId },
      status: InvitationStatus.PENDING,
      message: message ?? null,
    });
    const saved = await this.staffAssociationRequestRepository.save(request);
    await this.notifyDirectorsOfStaffAssociationRequest(company, user, message);
    return saved;
  }

  public async getMyStaffAssociationRequest(userId: string) {
    try {
      const [request] = await this.staffAssociationRequestRepository.find({
        where: {
          user: { id: userId },
          status: InvitationStatus.PENDING,
        },
        relations: ['company'],
        order: { createdAt: 'DESC' },
        take: 1,
      });

      if (!request) {
        return { request: null };
      }

      return {
        request: {
          id: request.id,
          companyId: request.company?.id,
          companyName: request.company?.name,
          status: request.status,
          message: request.message,
          createdAt: request.createdAt,
        },
      };
    } catch (error) {
      Logger.warn(
        `getMyStaffAssociationRequest failed for user ${userId}: ${error instanceof Error ? error.message : error}`,
      );
      return { request: null };
    }
  }

  private getFrontendUrl(): string {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  private async notifyDirectorsOfStaffAssociationRequest(
    company: Company,
    applicant: User,
    message?: string,
  ): Promise<void> {
    try {
      const companyWithUsers = await this.companyRepository.findOne({
        where: { id: company.id },
        relations: ['users'],
      });
      if (!companyWithUsers?.users?.length) return;

      const directors = companyWithUsers.users.filter(
        (u) => u.role === UserRole.DIRECTOR && u.email,
      );
      if (!directors.length) return;

      const from = process.env.RESEND_FROM_EMAIL || 'noreply@stp.com';
      const reviewUrl = `${this.getFrontendUrl()}/entrenadores`;
      const applicantName = `${applicant.name} ${applicant.lastName}`.trim();

      for (const director of directors) {
        const mail = staffAssociationRequestEmail(
          director.email,
          director.name,
          applicantName,
          applicant.role,
          companyWithUsers.name,
          reviewUrl,
          from,
          message,
        );
        await this.mailingService.sendMail(mail);
      }
    } catch (error) {
      Logger.error('Error sending staff association request emails', error);
    }
  }

  private async notifyStaffAssociationApproved(
    request: StaffAssociationRequest,
    companyName: string,
    companyResponse?: string,
  ): Promise<void> {
    try {
      if (!request.user?.email) return;
      const from = process.env.RESEND_FROM_EMAIL || 'noreply@stp.com';
      const dashboardUrl = `${this.getFrontendUrl()}/dashboard`;
      const mail = staffAssociationApprovedEmail(
        request.user.email,
        request.user.name,
        companyName,
        dashboardUrl,
        from,
        companyResponse,
      );
      await this.mailingService.sendMail(mail);
    } catch (error) {
      Logger.error('Error sending staff association approved email', error);
    }
  }

  private async notifyStaffAssociationRejected(
    request: StaffAssociationRequest,
    companyName: string,
    companyResponse?: string,
  ): Promise<void> {
    try {
      if (!request.user?.email) return;
      const from = process.env.RESEND_FROM_EMAIL || 'noreply@stp.com';
      const mail = staffAssociationRejectedEmail(
        request.user.email,
        request.user.name,
        companyName,
        from,
        companyResponse,
      );
      await this.mailingService.sendMail(mail);
    } catch (error) {
      Logger.error('Error sending staff association rejected email', error);
    }
  }

  public async getPendingStaffAssociationRequests(
    companyId: string,
    directorId: string,
  ) {
    await this.assertDirectorCanManageCompany(companyId, directorId);
    return await this.staffAssociationRequestRepository.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.PENDING,
      },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  public async approveStaffAssociationRequest(
    companyId: string,
    requestId: string,
    directorId: string,
    companyResponse?: string,
  ): Promise<StaffAssociationRequest> {
    const company = await this.assertDirectorCanManageCompany(
      companyId,
      directorId,
    );

    const request = await this.staffAssociationRequestRepository.findOne({
      where: {
        id: requestId,
        company: { id: companyId },
        status: InvitationStatus.PENDING,
      },
      relations: ['user'],
    });
    if (!request?.user) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    if (!STAFF_ASSOCIATION_REQUEST_ROLES.includes(request.user.role)) {
      throw new BadRequestException('El usuario no puede asociarse como staff');
    }

    const isAlreadyAssociated = company.users.some(
      (u) => u.id === request.user.id,
    );
    if (!isAlreadyAssociated) {
      company.users.push(request.user);
      await this.companyRepository.save(company);
    }
    await this.ensureActiveMembership(company.id, request.user, directorId);

    request.status = InvitationStatus.APPROVED;
    request.approvedAt = new Date();
    request.companyResponse = companyResponse ?? null;
    const saved = await this.staffAssociationRequestRepository.save(request);
    await this.notifyStaffAssociationApproved(saved, company.name, companyResponse);
    return saved;
  }

  public async rejectStaffAssociationRequest(
    companyId: string,
    requestId: string,
    directorId: string,
    companyResponse?: string,
  ): Promise<StaffAssociationRequest> {
    const company = await this.assertDirectorCanManageCompany(
      companyId,
      directorId,
    );

    const request = await this.staffAssociationRequestRepository.findOne({
      where: {
        id: requestId,
        company: { id: companyId },
        status: InvitationStatus.PENDING,
      },
      relations: ['user'],
    });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada o ya procesada');
    }

    request.status = InvitationStatus.REJECTED;
    request.rejectedAt = new Date();
    request.companyResponse = companyResponse ?? null;
    const saved = await this.staffAssociationRequestRepository.save(request);
    await this.notifyStaffAssociationRejected(saved, company.name, companyResponse);
    return saved;
  }
}
