import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AssociateTrainerDto } from './dto/associate-trainer.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { JoinCompanyDto } from './dto/join-company.dto';
import { AssociationRequestDto } from './dto/association-request.dto';
import { TrainerResponseDto } from './dto/trainer-response.dto';
import { TrainerDetailResponseDto } from './dto/trainer-detail-response.dto';
import { AuthGuard } from '@nestjs/passport';
import { PaginationQueryDto } from 'src/common/pagination/DTOs/pagination-query.dto';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async create(@Body() createCompanyDto: CreateCompanyDto, @GetUser() user: User) {
    return await this.companyService.create(createCompanyDto, user);
  }

  @Get('admin/list')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async listCompaniesForAdmin(
    @GetUser() user: User,
    @Query() pagination: PaginationQueryDto,
    @Req() request,
    @Query('active') active?: string,
    @Query('search') search?: string,
    @Query('accountType') accountType?: string,
  ) {
    if (user.role !== UserRole.STP_ADMIN) {
      throw new ForbiddenException('Only STP_ADMIN can list all companies');
    }
    const activeFilter =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.companyService.listCompaniesForAdmin(
      pagination.offset,
      pagination.limit,
      request.url,
      { active: activeFilter, search, accountType },
    );
  }

  @Get('admin/operating')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async getOperatingCompany(@GetUser() user: User) {
    if (user.role !== UserRole.STP_ADMIN) {
      throw new ForbiddenException('Only STP_ADMIN can access operating company');
    }
    return this.companyService.getOperatingCompany();
  }

  @Patch('admin/:id/subscription')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async setCompanySubscription(
    @Param('id') id: string,
    @Body() dto: UpdateCompanySubscriptionDto,
    @GetUser() user: User,
  ) {
    return this.companyService.setCompanySubscriptionActive(id, dto, user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async findAll(
    @GetUser() user: User,
    @Query() pagination: PaginationQueryDto,
    @Req() request,
  ): Promise<PaginatedListDto<CreateCompanyDto>> {
    if (user.role !== UserRole.STP_ADMIN) {
      throw new ForbiddenException('Only STP_ADMIN can list all companies');
    }
    return await this.companyService.findAll(
      pagination.offset,
      pagination.limit,
      request.url,
    );
  }

  @Get('user/:userId')
  @SkipCompanySubscriptionCheck()
  public async getCompaniesByUser(@Param('userId') userId: string) {
    return this.companyService.findCompaniesByUser(userId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  public async findOne(@Param('id') id: string): Promise<CreateCompanyDto> {
    return await this.companyService.findOne(id);
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
  public async getCompanyPublicInfo(
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
  ) {
    return await this.companyService.getCompanyPublicInfo(companyId);
  }

  @Post('join/:companyId')
  public async joinCompanyAsTrainer(
    @Param('companyId') companyId: string,
    @Body() joinCompanyDto: JoinCompanyDto,
  ) {
    return await this.companyService.joinCompanyAsTrainer(companyId, joinCompanyDto);
  }

  @Post(':companyId/association-request')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async requestStaffAssociation(
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: AssociationRequestDto,
    @GetUser() user: User,
  ) {
    const request = await this.companyService.requestStaffAssociation(
      companyId,
      user,
      dto.message,
    );
    return {
      message: 'Solicitud enviada correctamente. El director del centro será notificado.',
      data: request,
    };
  }

  @Get(':companyId/association-requests/pending')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async getPendingStaffAssociationRequests(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    return await this.companyService.getPendingStaffAssociationRequests(
      companyId,
      user.id,
    );
  }

  @Put(':companyId/association-requests/:requestId/approve')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async approveStaffAssociationRequest(
    @Param('companyId') companyId: string,
    @Param('requestId') requestId: string,
    @Body() body: { companyResponse?: string },
    @GetUser() user: User,
  ) {
    return await this.companyService.approveStaffAssociationRequest(
      companyId,
      requestId,
      user.id,
      body?.companyResponse,
    );
  }

  @Put(':companyId/association-requests/:requestId/reject')
  @UseGuards(AuthGuard('jwt'))
  @SkipCompanySubscriptionCheck()
  public async rejectStaffAssociationRequest(
    @Param('companyId') companyId: string,
    @Param('requestId') requestId: string,
    @Body() body: { companyResponse?: string },
    @GetUser() user: User,
  ) {
    return await this.companyService.rejectStaffAssociationRequest(
      companyId,
      requestId,
      user.id,
      body?.companyResponse,
    );
  }

  // Endpoints para obtener entrenadores/staff del centro
  @Get(':companyId/trainers/all')
  @UseGuards(AuthGuard('jwt'))
  public async getAllCompanyTrainers(@Param('companyId') companyId: string) {
    return await this.companyService.getAllCompanyTrainers(companyId);
  }

  @Post(':companyId/trainers')
  @UseGuards(AuthGuard('jwt'))
  public async addStaffToCompany(
    @Param('companyId') companyId: string,
    @Body() addStaffDto: AddStaffDto,
  ) {
    const result = await this.companyService.addStaffToCompany(
      companyId,
      addStaffDto,
    );
    return { data: result };
  }

  @Patch(':companyId/trainers/:trainerId/role')
  @UseGuards(AuthGuard('jwt'))
  public async updateStaffRole(
    @Param('companyId') companyId: string,
    @Param('trainerId') trainerId: string,
    @Body() body: { role: UserRole },
  ) {
    const validRoles = [
      UserRole.TRAINER,
      UserRole.SUB_TRAINER,
      UserRole.DIRECTOR,
      UserRole.SECRETARIA,
    ];
    if (!validRoles.includes(body.role)) {
      throw new BadRequestException('Rol inválido');
    }
    const result = await this.companyService.updateStaffRole(
      companyId,
      trainerId,
      body.role as UserRole.TRAINER | UserRole.SUB_TRAINER | UserRole.DIRECTOR | UserRole.SECRETARIA,
    );
    return { data: result };
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
