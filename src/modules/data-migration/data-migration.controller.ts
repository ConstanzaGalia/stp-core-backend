import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';
import { DataMigrationService } from './data-migration.service';
import {
  MigrateAthletesConfirmDto,
  MigrateAthletesPreviewDto,
} from './dto/migrate-athletes.dto';
import {
  MigrateSchedulesConfirmDto,
  MigrateSchedulesPreviewDto,
} from './dto/migrate-schedules.dto';

@Controller('data-migration')
@UseGuards(AuthGuard('jwt'))
@SkipCompanySubscriptionCheck()
export class DataMigrationController {
  constructor(private readonly dataMigrationService: DataMigrationService) {}

  @Post(':companyId/athletes/preview')
  async previewAthletes(
    @GetUser() user: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: MigrateAthletesPreviewDto,
  ) {
    return this.dataMigrationService.previewAthletes(user, companyId, dto);
  }

  @Post(':companyId/athletes/confirm')
  async confirmAthletes(
    @GetUser() user: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: MigrateAthletesConfirmDto,
  ) {
    return this.dataMigrationService.confirmAthletes(user, companyId, dto);
  }

  @Post(':companyId/schedules/preview')
  async previewSchedules(
    @GetUser() user: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: MigrateSchedulesPreviewDto,
  ) {
    return this.dataMigrationService.previewSchedules(user, companyId, dto);
  }

  @Post(':companyId/schedules/confirm')
  async confirmSchedules(
    @GetUser() user: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: MigrateSchedulesConfirmDto,
  ) {
    return this.dataMigrationService.confirmSchedules(user, companyId, dto);
  }
}
