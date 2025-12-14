import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { User } from 'src/entities/user.entity';
import { ScheduleConfig } from 'src/entities/schedule-config.entity';
import { ScheduleException } from 'src/entities/schedule-exception.entity';
import { TimeSlotGeneration } from 'src/entities/time-slot-generation.entity';
import { AthleteSchedule } from 'src/entities/athlete-schedule.entity';
import { UserPaymentSubscription } from 'src/entities/user-payment-subscription.entity';
import { ClassUsage } from 'src/entities/class-usage.entity';
import { Payment } from 'src/entities/payment.entity';
import { WaitlistReservation } from 'src/entities/waitlist-reservation.entity';
import { AvailableClass } from 'src/entities/available-class.entity';
import { ReservationsController } from './reservation.controller';
import { ReservationsService } from './reservation.service';
import { PaymentsModule } from '../payments/payments.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation, TimeSlot, User, Company, ScheduleConfig, ScheduleException, TimeSlotGeneration, AthleteSchedule, UserPaymentSubscription, ClassUsage, Payment, WaitlistReservation, AvailableClass]), 
    forwardRef(() => PaymentsModule),
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService], 
})
export class ReservationsModule {}
