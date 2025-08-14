import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { User } from 'src/entities/user.entity';
import { ScheduleConfig } from 'src/entities/schedule-config.entity';
import { ScheduleException } from 'src/entities/schedule-exception.entity';
import { TimeSlotGeneration } from 'src/entities/time-slot-generation.entity';
import { ReservationsController } from './reservation.controller';
import { ReservationsService } from './reservation.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation, TimeSlot, User, Company, ScheduleConfig, ScheduleException, TimeSlotGeneration]), 
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService], 
})
export class ReservationsModule {}
