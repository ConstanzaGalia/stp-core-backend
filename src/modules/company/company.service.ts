import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
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
import { assertStpAdmin } from 'src/common/helpers/company-access.helper';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';

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
    private pagination: Pagination,
    private readonly mailingService: MailingService,
    private readonly encryptService: EncryptService,
  ) {}
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

      const newCompany = this.companyRepository.create({
        ...payload,
        subscriptionActive: false,
        ...(createCompanyDto.accountType ? { accountType: createCompanyDto.accountType } : {}),
      });
      newCompany.users = [user];
      return await this.companyRepository.save(newCompany);
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
        .getMany();
    } catch (error) {
      Logger.log('Have an error in get all companies by user', error)
      return []
    }
  }

  public async getOperatingCompany(): Promise<Company | null> {
    const id = getStpOperatingCompanyId();
    return this.companyRepository.findOne({ where: { id } });
  }

  public async listCompaniesForAdmin(
    offset: number,
    limit: number,
    path: string,
    options?: { active?: boolean; search?: string; accountType?: string },
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
      qb.andWhere('company.account_type = :accountType', { accountType: options.accountType.trim() });
    }

    const [companies, count] = await qb.skip(offset).take(limit).getManyAndCount();

    const items = companies.map(company => {
      const directors = (company.users ?? []).filter(
        u => u.role === UserRole.DIRECTOR || u.role === UserRole.STP_ADMIN,
      );
      const staffCount = (company.users ?? []).filter(u =>
        STAFF_ROLES.includes(u.role),
      ).length;

      return {
        id: company.id,
        name: company.name,
        subscriptionActive: company.subscriptionActive,
        accountType: company.accountType,
        createdAt: company.created_at,
        directors: directors.map(d => ({
          id: d.id,
          name: d.name,
          lastName: d.lastName,
          email: d.email,
        })),
        staffCount,
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
    assertStpAdmin(admin);

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    company.subscriptionActive = dto.subscriptionActive;
    return this.companyRepository.save(company);
  }

  public async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    try {
      return await this.companyRepository.update(id, updateCompanyDto);
    } catch (error) {
      Logger.log(`Error to update company ${id}`, error);
    }
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

    // Remover el miembro de la empresa
    company.users = company.users.filter(user => user.id !== trainerId);
    await this.companyRepository.save(company);
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

  // Método para obtener todo el personal del centro (entrenadores, directores, secretarias)
  public async getAllCompanyTrainers(companyId: string): Promise<TrainerResponseDto[]> {
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

    // Filtrar todo el staff: entrenadores, directores, secretarias (excluir atletas)
    const staff = company.users.filter(user => STAFF_ROLES.includes(user.role));

    // Mapear a DTO de respuesta (incluye specialty/experience para compatibilidad con frontend)
    return staff.map(member => ({
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
      specialty: member.specialty,
      experience: member.experienceYears?.toString(),
      status: member.isActive ? 'active' : 'inactive',
      athletesCount: 0, // Se puede calcular si se necesita
    }));
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
        await this.userRepository.save(user);
      }

      company.users.push(user);
      await this.companyRepository.save(company);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        phoneNumber: user.phoneNumber,
        country: user.country,
        city: user.city,
        imageProfile: user.imageProfile,
        associationDate: user.created_at,
        specialty: user.specialty,
        experience: user.experienceYears?.toString(),
        status: user.isActive ? 'active' : 'inactive',
        athletesCount: 0,
      };
    }

    // Usuario nuevo: crear y asociar (requiere contraseña)
    if (!addStaffDto.password || addStaffDto.password.length < 8) {
      throw new BadRequestException('Para crear un nuevo usuario se requiere una contraseña de al menos 8 caracteres');
    }

    const passwordEncrypted = await this.encryptService.encryptedData(addStaffDto.password);
    const newUser = this.userRepository.create({
      name: addStaffDto.name,
      lastName: addStaffDto.lastName || addStaffDto.name,
      email: addStaffDto.email,
      password: passwordEncrypted,
      role: addStaffDto.role,
      phoneNumber: addStaffDto.phone ? parseInt(addStaffDto.phone.replace(/\D/g, ''), 10) : undefined,
      specialty: addStaffDto.specialty,
      experienceYears: addStaffDto.experience ? parseInt(addStaffDto.experience, 10) : undefined,
      isActive: false, // Requiere activación
    });

    const savedUser = await this.userRepository.save(newUser);
    company.users.push(savedUser);
    await this.companyRepository.save(company);

    return {
      id: savedUser.id,
      email: savedUser.email,
      name: savedUser.name,
      lastName: savedUser.lastName,
      role: savedUser.role,
      isActive: savedUser.isActive,
      phoneNumber: savedUser.phoneNumber,
      country: savedUser.country,
      city: savedUser.city,
      imageProfile: savedUser.imageProfile,
      associationDate: savedUser.created_at,
      specialty: savedUser.specialty,
      experience: savedUser.experienceYears?.toString(),
      status: savedUser.isActive ? 'active' : 'inactive',
      athletesCount: 0,
    };
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
