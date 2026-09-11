import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STPTrainingProfile } from 'src/entities/stp-training-profile.entity';
import { STPMacroPlan } from 'src/entities/stp-macro-plan.entity';
import { STPWeeklyTemplate } from 'src/entities/stp-weekly-template.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { Exercise } from 'src/entities/excercise.entity';
import { AthleteInvitation } from 'src/entities/athlete-invitation.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { Company } from 'src/entities/company.entity';
import { Division } from 'src/entities/division.entity';
import { SubscriptionSuspension } from 'src/entities/subscription-suspension.entity';
import { TrainingPlannerService } from './training-planner.service';
import { TrainingPlannerController } from './training-planner.controller';
import { ReservationsModule } from '../reservation/reservation.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      STPTrainingProfile,
      STPMacroPlan,
      STPWeeklyTemplate,
      STPSessionInstance,
      Exercise,
      AthleteInvitation,
      Reservation,
      Company,
      Division,
      SubscriptionSuspension,
    ]),
    forwardRef(() => ReservationsModule),
    CompanyModule,
  ],
  providers: [TrainingPlannerService],
  controllers: [TrainingPlannerController],
  exports: [TrainingPlannerService],
})
export class TrainingPlannerModule {}