import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AssociateTrainerDto } from './dto/associate-trainer.dto';
import { JoinCompanyDto } from './dto/join-company.dto';
import { TrainerResponseDto } from './dto/trainer-response.dto';
import { TrainerDetailResponseDto } from './dto/trainer-detail-response.dto';
import { AuthGuard } from '@nestjs/passport';
import { PaginationQueryDto } from 'src/common/pagination/DTOs/pagination-query.dto';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  public async create(@Body() createCompanyDto: CreateCompanyDto, @GetUser() user: User) {
    return await this.companyService.create(createCompanyDto, user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  public async findAll(
    @Query() pagination: PaginationQueryDto,
    @Req() request,
  ): Promise<PaginatedListDto<CreateCompanyDto>> {
    return await this.companyService.findAll(
      pagination.offset,
      pagination.limit,
      request.url,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  public async findOne(@Param('id') id: string): Promise<CreateCompanyDto> {
    return await this.companyService.findOne(id);
  }

  @Get('/user/:userId')
  public async getCompaniesByUser(@Param('userId') userId: string) {
    return this.companyService.findCompaniesByUser(userId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  public async update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return await this.companyService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  public async remove(@Param('id') id: string): Promise<string> {
    return await this.companyService.remove(id);
  }

  // Endpoints para gestión de entrenadores
  @Post(':companyId/associate-trainer')
  @UseGuards(AuthGuard('jwt'))
  public async associateTrainer(
    @Param('companyId') companyId: string,
    @Body() associateTrainerDto: AssociateTrainerDto,
    @GetUser() director: User,
  ) {
    return await this.companyService.associateTrainer(
      companyId,
      director.id,
      associateTrainerDto,
    );
  }

  @Get(':companyId/trainers')
  @UseGuards(AuthGuard('jwt'))
  public async getCompanyTrainers(
    @Param('companyId') companyId: string,
    @GetUser() director: User,
  ) {
    return await this.companyService.getCompanyTrainers(companyId, director.id);
  }

  @Delete(':companyId/trainers/:trainerId')
  @UseGuards(AuthGuard('jwt'))
  public async removeTrainerFromCompany(
    @Param('companyId') companyId: string,
    @Param('trainerId') trainerId: string,
    @GetUser() director: User,
  ) {
    await this.companyService.removeTrainerFromCompany(companyId, director.id, trainerId);
    return { message: 'Trainer removed from company successfully' };
  }

  @Get('search-available-trainers')
  @UseGuards(AuthGuard('jwt'))
  public async searchAvailableTrainers(@Query('search') searchTerm: string) {
    return await this.companyService.searchAvailableTrainers(searchTerm);
  }

  // Endpoints públicos para que entrenadores se unan a centros
  @Get('public/:companyId')
  public async getCompanyPublicInfo(@Param('companyId') companyId: string) {
    return await this.companyService.getCompanyPublicInfo(companyId);
  }

  @Post('join/:companyId')
  public async joinCompanyAsTrainer(
    @Param('companyId') companyId: string,
    @Body() joinCompanyDto: JoinCompanyDto,
  ) {
    return await this.companyService.joinCompanyAsTrainer(companyId, joinCompanyDto);
  }

  // Endpoints para obtener entrenadores del centro
  @Get(':companyId/trainers/all')
  @UseGuards(AuthGuard('jwt'))
  public async getAllCompanyTrainers(@Param('companyId') companyId: string) {
    return await this.companyService.getAllCompanyTrainers(companyId);
  }

  @Get(':companyId/trainers')
  @UseGuards(AuthGuard('jwt'))
  public async getCompanyTrainersPaginated(
    @Param('companyId') companyId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return await this.companyService.getCompanyTrainersPaginated(companyId, page, limit);
  }

  @Get(':companyId/trainers/search')
  @UseGuards(AuthGuard('jwt'))
  public async searchCompanyTrainers(
    @Param('companyId') companyId: string,
    @Query('q') searchTerm: string,
  ) {
    return await this.companyService.searchCompanyTrainers(companyId, searchTerm);
  }

  // Endpoints para obtener información detallada de entrenadores
  @Get(':companyId/trainers/:trainerId')
  @UseGuards(AuthGuard('jwt'))
  public async getTrainerDetail(
    @Param('companyId') companyId: string,
    @Param('trainerId') trainerId: string,
  ) {
    return await this.companyService.getTrainerDetail(companyId, trainerId);
  }

  @Get('trainers/:trainerId')
  @UseGuards(AuthGuard('jwt'))
  public async getAnyTrainerDetail(@Param('trainerId') trainerId: string) {
    return await this.companyService.getAnyTrainerDetail(trainerId);
  }

  // Endpoints para obtener alumnos del centro
  @Get(':companyId/students/all')
  @UseGuards(AuthGuard('jwt'))
  public async getAllCompanyStudents(@Param('companyId') companyId: string) {
    return await this.companyService.getAllCompanyStudents(companyId);
  }

  @Get(':companyId/students')
  @UseGuards(AuthGuard('jwt'))
  public async getCompanyStudentsPaginated(
    @Param('companyId') companyId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return await this.companyService.getCompanyStudentsPaginated(companyId, page, limit);
  }

  // Endpoints para invitación de alumnos
  @Post(':companyId/invite-student')
  @UseGuards(AuthGuard('jwt'))
  public async inviteStudentToCompany(
    @Param('companyId') companyId: string,
    @Body() body: { studentEmail: string },
    @GetUser() director: User,
  ) {
    return await this.companyService.inviteStudentToCompany(
      companyId, 
      body.studentEmail, 
      director.id
    );
  }

  @Post(':companyId/join-as-student')
  public async joinCompanyAsStudent(
    @Param('companyId') companyId: string,
    @Body() body: { studentEmail: string },
  ) {
    return await this.companyService.joinCompanyAsStudent(companyId, body.studentEmail);
  }
}
