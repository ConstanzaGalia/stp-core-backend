import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { User } from 'src/entities/user.entity';
import { GetUser } from '../auth/get-user.decorator';
import { AthleteProgramLeadsService } from './athlete-program-leads.service';
import {
  ListAthleteProgramLeadsQueryDto,
  UpdateAthleteProgramLeadStatusDto,
} from './dto/athlete-program-leads.dto';

/** Pipeline de interesados en entrenar. Solo STP_ADMIN. */
@Controller('admin/athlete-program-leads')
@UseGuards(AuthGuard('jwt'))
@SkipCompanySubscriptionCheck()
export class AthleteProgramLeadsAdminController {
  constructor(private readonly leadsService: AthleteProgramLeadsService) {}

  @Get()
  list(@GetUser() user: User, @Query() query: ListAthleteProgramLeadsQueryDto) {
    return this.leadsService.listLeads(user, query);
  }

  @Patch(':id/status')
  updateStatus(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAthleteProgramLeadStatusDto,
  ) {
    return this.leadsService.updateStatus(user, id, dto.status);
  }
}
