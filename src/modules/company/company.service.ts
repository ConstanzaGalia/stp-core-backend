import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Repository } from 'typeorm';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { Pagination } from 'src/common/pagination/pagination';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
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
            role: UserRole.TRAINER,
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
}
