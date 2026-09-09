import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STPTrainingProfile } from 'src/entities/stp-training-profile.entity';
import { STPMacroPlan } from 'src/entities/stp-macro-plan.entity';
import { STPWeeklyTemplate } from 'src/entities/stp-weekly-template.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { Exercise } from 'src/entities/excercise.entity';
import { AthleteInvitation } from 'src/entities/athlete-invitation.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TrainingPlannerService } from './training-planner.service';
import { TrainingPlannerController } from './training-planner.controller';
import { ReservationsModule } from '../reservation/reservation.module';

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
    ]),
    forwardRef(() => ReservationsModule),
  ],
  providers: [TrainingPlannerService],
  controllers: [TrainingPlannerController],
  exports: [TrainingPlannerService],
})
export class TrainingPlannerModule {}
