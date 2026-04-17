import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STPTrainingProfile } from 'src/entities/stp-training-profile.entity';
import { STPMacroPlan } from 'src/entities/stp-macro-plan.entity';
import { STPWeeklyTemplate } from 'src/entities/stp-weekly-template.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { TrainingPlannerService } from './training-planner.service';
import { TrainingPlannerController } from './training-planner.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      STPTrainingProfile,
      STPMacroPlan,
      STPWeeklyTemplate,
      STPSessionInstance,
    ]),
  ],
  providers: [TrainingPlannerService],
  controllers: [TrainingPlannerController],
  exports: [TrainingPlannerService],
})
export class TrainingPlannerModule {}
