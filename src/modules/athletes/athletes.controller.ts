import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { AthletesService } from './athletes.service';
import { UserRole } from '../../common/enums/enums';
import { RequestJoinDto } from './dto/request-join-dto';
import { ResponseInvitationDto } from './dto/response-invitation-dto';
import { CreateAthleteDto } from './dto/create-athlete.dto';
import { ForbiddenException } from '@nestjs/common';

const STAFF_ROLES = [UserRole.STP_ADMIN, UserRole.DIRECTOR, UserRole.TRAINER, UserRole.SUB_TRAINER];

@Controller('athletes')
export class AthletesController {
  constructor(private readonly athletesService: AthletesService) {}

  // === ENDPOINTS PARA ATLETAS ===

  @Post(':companyId/request-join')
  @UseGuards(AuthGuard('jwt'))
  async requestToJoinCompany(
    @Param('companyId') companyId: string,
    @Body() requestJoinDto: RequestJoinDto,
    @GetUser() athlete: User
  ) {
    // Verificar que el usuario es un atleta
    if (athlete.role !== UserRole.ATHLETE) {
      throw new ForbiddenException('Only athletes can request to join companies');
    }

    return await this.athletesService.requestToJoinCompany(
      athlete.id,
      companyId,
      requestJoinDto.message
    );
  }

  @Get('my-invitations')
  @UseGuards(AuthGuard('jwt'))
  async getMyInvitations(@GetUser() athlete: User) {
    // Verificar que el usuario es un atleta
    if (athlete.role !== UserRole.ATHLETE) {
      throw new ForbiddenException('Only athletes can view their invitations');
    }

    return await this.athletesService.getMyInvitations(athlete.id);
  }

  @Get('check-subscription/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async checkAthleteSubscription(
    @Param('companyId') companyId: string,
    @GetUser() athlete: User
  ) {
    // Verificar que el usuario es un atleta
    if (athlete.role !== UserRole.ATHLETE) {
      throw new ForbiddenException('Only athletes can check their subscription status');
    }

    return await this.athletesService.checkAthleteSubscription(athlete.id, companyId);
  }

  @Get('my-centers')
  @UseGuards(AuthGuard('jwt'))
  async getMySubscribedCenters(@GetUser() athlete: User) {
    // Verificar que el usuario es un atleta
    if (athlete.role !== UserRole.ATHLETE) {
      throw new ForbiddenException('Only athletes can view their subscribed centers');
    }

    return await this.athletesService.getMySubscribedCenters(athlete.id);
  }

  @Put(':companyId/leave')
  @UseGuards(AuthGuard('jwt'))
  async leaveCompany(
    @Param('companyId') companyId: string,
    @GetUser() athlete: User
  ) {
    // Verificar que el usuario es un atleta
    if (athlete.role !== UserRole.ATHLETE) {
      throw new ForbiddenException('Only athletes can leave companies');
    }

    return await this.athletesService.leaveCompany(athlete.id, companyId);
  }

  // === ENDPOINTS PARA COMPAÑÍAS ===

  @Post('company/:companyId/create-athlete')
  @UseGuards(AuthGuard('jwt'))
  async createAthlete(
    @Param('companyId') companyId: string,
    @Body() createAthleteDto: CreateAthleteDto,
    @GetUser() user: User
  ) {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException('Solo entrenadores o directores pueden crear atletas');
    }
    const result = await this.athletesService.createAthleteForCompany(companyId, createAthleteDto);
    return {
      message: 'Atleta creado correctamente. Contraseña temporal: EntrenamientoSTP1@',
      user: {
        id: result.user.id,
        name: result.user.name,
        lastName: result.user.lastName,
        email: result.user.email,
      },
    };
  }

  @Get('company/:companyId/pending')
  @UseGuards(AuthGuard('jwt'))
  async getPendingInvitations(@Param('companyId') companyId: string, @GetUser() companyUser: User) {
    // Verificar que el usuario pertenece a la empresa y tiene permisos
    return await this.athletesService.getPendingInvitations(companyId);
  }

  @Put('company/:companyId/approve/:invitationId')
  @UseGuards(AuthGuard('jwt'))
  async approveInvitation(
    @Param('companyId') companyId: string,
    @Param('invitationId') invitationId: string,
    @Body() responseDto: ResponseInvitationDto
  ) {
    return await this.athletesService.approveInvitation(
      companyId,
      invitationId,
      responseDto.companyResponse
    );
  }

  @Put('company/:companyId/reject/:invitationId')
  @UseGuards(AuthGuard('jwt'))
  async rejectInvitation(
    @Param('companyId') companyId: string,
    @Param('invitationId') invitationId: string,
    @Body() responseDto: ResponseInvitationDto
  ) {
    return await this.athletesService.rejectInvitation(
      companyId,
      invitationId,
      responseDto.companyResponse
    );
  }

  @Get('company/:companyId/athletes')
  @UseGuards(AuthGuard('jwt'))
  async getCompanyAthletes(@Param('companyId') companyId: string) {
    return await this.athletesService.getCompanyAthletes(companyId);
  }

  @Get('company/:companyId/check-athlete/:athleteId')
  @UseGuards(AuthGuard('jwt'))
  async checkAthleteInCompany(
    @Param('companyId') companyId: string,
    @Param('athleteId') athleteId: string
  ) {
    return await this.athletesService.checkAthleteInCompany(companyId, athleteId);
  }

  @Patch('company/:companyId/athletes/:athleteId/online')
  @UseGuards(AuthGuard('jwt'))
  async updateAthleteOnline(
    @Param('companyId') companyId: string,
    @Param('athleteId') athleteId: string,
    @Body('isOnline') isOnline: boolean,
    @GetUser() user: User
  ) {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException('Solo entrenadores o directores pueden actualizar el estado online');
    }
    return await this.athletesService.updateAthleteOnlineStatus(companyId, athleteId, isOnline);
  }

  @Delete('company/:companyId/athletes/:athleteId')
  @UseGuards(AuthGuard('jwt'))
  async removeAthlete(
    @Param('companyId') companyId: string,
    @Param('athleteId') athleteId: string
  ) {
    return await this.athletesService.removeAthlete(companyId, athleteId);
  }

  @Get('company/:companyId/statistics')
  @UseGuards(AuthGuard('jwt'))
  async getCompanyStatistics(@Param('companyId') companyId: string) {
    return await this.athletesService.getCompanyStatistics(companyId);
  }
}
