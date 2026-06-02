import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffSchedulingController } from './staff-scheduling.controller';
import { StaffSchedulingService } from './staff-scheduling.service';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { ScheduleConfig } from '../../entities/schedule-config.entity';
import { ScheduleException } from '../../entities/schedule-exception.entity';
import { StaffCompensationProfile } from '../../entities/staff-compensation-profile.entity';
import { StaffShiftAssignment } from '../../entities/staff-shift-assignment.entity';
import { StaffShiftClosure } from '../../entities/staff-shift-closure.entity';
import { StaffWeekNote } from '../../entities/staff-week-note.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      User,
      ScheduleConfig,
      ScheduleException,
      StaffCompensationProfile,
      StaffShiftAssignment,
      StaffShiftClosure,
      StaffWeekNote,
    ]),
    AuthModule,
  ],
  controllers: [StaffSchedulingController],
  providers: [StaffSchedulingService],
  exports: [StaffSchedulingService],
})
export class StaffSchedulingModule {}
