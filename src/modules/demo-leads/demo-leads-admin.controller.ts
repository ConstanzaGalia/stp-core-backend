import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { User } from 'src/entities/user.entity';
import { GetUser } from '../auth/get-user.decorator';
import { DemoLeadsService } from './demo-leads.service';
import { ListDemoLeadsQueryDto, UpdateDemoLeadStatusDto } from './dto/demo-leads.dto';

/** Vista de leads para el equipo de STP (solo STP_ADMIN). */
@Controller('admin/demo-leads')
@UseGuards(AuthGuard('jwt'))
@SkipCompanySubscriptionCheck()
export class DemoLeadsAdminController {
  constructor(private readonly demoLeadsService: DemoLeadsService) {}

  @Get()
  list(@GetUser() user: User, @Query() query: ListDemoLeadsQueryDto) {
    return this.demoLeadsService.listLeads(user, query);
  }

  @Patch(':id/status')
  updateStatus(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDemoLeadStatusDto,
  ) {
    return this.demoLeadsService.updateStatus(user, id, dto.status);
  }
}
