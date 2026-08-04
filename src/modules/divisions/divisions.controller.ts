import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DivisionsService } from './divisions.service';
import { DivisionAnalyticsService } from './division-analytics.service';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';

@Controller('divisions')
@UseGuards(AuthGuard('jwt'))
export class DivisionsController {
  constructor(
    private readonly divisionsService: DivisionsService,
    private readonly divisionAnalyticsService: DivisionAnalyticsService,
  ) {}

  @Get('company/:companyId')
  listByCompany(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
  ) {
    return this.divisionsService.listByCompany(companyId, actor);
  }

  @Post('company/:companyId')
  create(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: { name: string; description?: string },
  ) {
    return this.divisionsService.create(actor, companyId, dto);
  }

  @Get(':id/roster')
  getRoster(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Query('positionId') positionId?: string,
  ) {
    return this.divisionAnalyticsService.getRoster(actor, id, positionId ?? null);
  }

  @Get(':id/analytics')
  getAnalytics(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Query('groupBy') groupBy?: 'division' | 'position',
    @Query('positionId') positionId?: string,
  ) {
    return this.divisionAnalyticsService.getAnalytics(actor, id, {
      groupBy: groupBy ?? 'division',
      positionId: positionId ?? null,
    });
  }

  @Get(':id/coach-dashboard')
  getCoachDashboard(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Query('positionId') positionId?: string,
  ) {
    return this.divisionAnalyticsService.getCoachDashboard(actor, id, {
      positionId: positionId ?? null,
    });
  }

  @Get(':id')
  getOne(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.divisionAnalyticsService.assertCanAccessDivision(actor, id);
  }

  @Put(':id')
  update(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: { name?: string; description?: string },
  ) {
    return this.divisionsService.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.divisionsService.remove(actor, id);
  }

  @Post(':id/coaches')
  addCoach(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: { coachId: string },
  ) {
    return this.divisionsService.addCoach(actor, id, dto.coachId);
  }

  @Delete(':id/coaches/:coachId')
  removeCoach(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('coachId', ParseSanitizedUUIDPipe) coachId: string,
  ) {
    return this.divisionsService.removeCoach(actor, id, coachId);
  }

  @Put(':id/athletes/:athleteUserId')
  assignAthlete(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('athleteUserId', ParseSanitizedUUIDPipe) athleteUserId: string,
  ) {
    return this.divisionsService.assignAthlete(actor, id, athleteUserId);
  }

  @Delete(':id/athletes/:athleteUserId')
  removeAthleteFromDivision(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('athleteUserId', ParseSanitizedUUIDPipe) athleteUserId: string,
  ) {
    return this.divisionsService.removeAthleteFromDivision(actor, id, athleteUserId);
  }
}
