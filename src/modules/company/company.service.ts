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
import { Repository, In } from 'typeorm';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { Pagination } from 'src/common/pagination/pagination';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { AssociateTrainerDto } from './dto/associate-trainer.dto';
import { JoinCompanyDto } from './dto/join-company.dto';
import { TrainerResponseDto } from './dto/trainer-response.dto';
import { TrainerDetailResponseDto } from './dto/trainer-detail-response.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private pagination: Pagination,
  ) {}
  public async create(createCompanyDto: CreateCompanyDto, user: User) {
    try {
      const newCompany = this.companyRepository.create(createCompanyDto);
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
      return await this.companyRepository.find({
        where: {
          users: {
            id: userId,
            role: In([UserRole.TRAINER, UserRole.DIRECTOR]),
          },
        },
        relations: ['users'],
      });
    } catch (error) {
      Logger.log('Have an error in get all companies by user', error)
    }
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
      throw new ForbiddenException('Only directors can remove trainers from companies');
    }

    // Verificar que el entrenador existe en la empresa
    const trainer = company.users.find(user => 
      user.id === trainerId && 
      (user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER)
    );

    if (!trainer) {
      throw new NotFoundException('Trainer not found in this company');
    }

    // Remover el entrenador de la empresa
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
    };
  }

  // Método para obtener todos los entrenadores de un centro
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

    // Filtrar solo entrenadores (TRAINER y SUB_TRAINER)
    const trainers = company.users.filter(user => 
      user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER
    );

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
      associationDate: trainer.created_at, // Usar fecha de creación como aproximación
    }));
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

  // Método para obtener información detallada de un entrenador específico
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

    // Buscar el entrenador específico en la empresa
    const trainer = company.users.find(user => 
      user.id === trainerId && 
      (user.role === UserRole.TRAINER || user.role === UserRole.SUB_TRAINER)
    );

    if (!trainer) {
      throw new NotFoundException('Trainer not found in this company');
    }

    // Retornar información detallada del entrenador
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
      associationDate: trainer.created_at,
      companyId: company.id,
      companyName: company.name,
      createdAt: trainer.created_at,
      updatedAt: trainer.updated_at,
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
}
