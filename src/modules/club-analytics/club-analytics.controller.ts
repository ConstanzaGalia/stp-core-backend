import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';
import { ClubAnalyticsService } from './club-analytics.service';
import {
  CreateClubAnalyticsTrainerDto,
  UpdateClubAnalyticsTrainerDto,
} from './dto/club-analytics.dto';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ClubAnalyticsController {
  constructor(private readonly clubAnalyticsService: ClubAnalyticsService) {}

  @Get('company/:companyId/club-analytics-trainers')
  list(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
  ) {
    return this.clubAnalyticsService.listAccesses(actor, companyId);
  }

  @Post('company/:companyId/club-analytics-trainers')
  create(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: CreateClubAnalyticsTrainerDto,
  ) {
    return this.clubAnalyticsService.createAccess(actor, companyId, dto);
  }

  @Patch('company/:companyId/club-analytics-trainers/:id')
  update(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: UpdateClubAnalyticsTrainerDto,
  ) {
    return this.clubAnalyticsService.updateAccess(actor, companyId, id, dto);
  }

  @Post('company/:companyId/club-analytics-trainers/:id/resend-welcome-email')
  resend(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.clubAnalyticsService.resendWelcomeEmail(actor, companyId, id);
  }

  @Get('club-analytics-portal/me')
  portalMe(@GetUser() actor: User) {
    return this.clubAnalyticsService.getPortalMe(actor);
  }

  @Get('club-analytics-portal/roster')
  portalRoster(@GetUser() actor: User) {
    return this.clubAnalyticsService.getPortalRoster(actor);
  }

  @Get('club-analytics-portal/dashboard')
  portalDashboard(@GetUser() actor: User) {
    return this.clubAnalyticsService.getPortalDashboard(actor);
  }
}
