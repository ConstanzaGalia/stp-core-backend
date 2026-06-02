import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { StaffSchedulingService } from './staff-scheduling.service';
import {
  CopyWeekDto,
  UpdateCompensationBatchDto,
  UpsertWeekAssignmentsDto,
} from './dto/staff-scheduling.dto';

@Controller('company/:companyId/staff-scheduling')
@UseGuards(AuthGuard('jwt'))
export class StaffSchedulingController {
  constructor(private readonly staffSchedulingService: StaffSchedulingService) {}

  @Get('grid-template')
  getGridTemplate(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('weekStart') weekStart?: string,
  ) {
    return this.staffSchedulingService.getGridTemplate(companyId, user, weekStart);
  }

  @Get('assignments')
  getAssignments(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('weekStart') weekStart?: string,
  ) {
    return this.staffSchedulingService.getWeekAssignments(companyId, user, weekStart);
  }

  @Put('assignments')
  upsertAssignments(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('weekStart') weekStart: string,
    @Body() dto: UpsertWeekAssignmentsDto,
  ) {
    return this.staffSchedulingService.upsertWeekAssignments(
      companyId,
      user,
      weekStart,
      dto,
    );
  }

  @Post('weeks/copy')
  copyWeek(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('weekStart') weekStart: string,
    @Body() dto: CopyWeekDto,
  ) {
    return this.staffSchedulingService.copyPreviousWeek(
      companyId,
      user,
      weekStart,
      dto.sourceWeekStart,
    );
  }

  @Get('hours-summary')
  getHoursSummary(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('year') year: string,
  ) {
    return this.staffSchedulingService.getHoursSummary(
      companyId,
      user,
      parseInt(year, 10),
    );
  }

  @Get('payroll')
  getPayroll(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.staffSchedulingService.getPayroll(
      companyId,
      user,
      parseInt(year, 10),
      parseInt(month, 10),
    );
  }

  @Get('compensation')
  getCompensation(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    return this.staffSchedulingService.getCompensationProfiles(companyId, user);
  }

  @Put('compensation')
  updateCompensation(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Body() dto: UpdateCompensationBatchDto,
  ) {
    return this.staffSchedulingService.updateCompensationProfiles(
      companyId,
      user,
      dto,
    );
  }
}
