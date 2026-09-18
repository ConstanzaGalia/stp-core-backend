import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injury } from 'src/entities/injury.entity';
import { User } from 'src/entities/user.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { InjuriesController } from './injuries.controller';
import { InjuriesService } from './injuries.service';
import { TrainingPlannerModule } from '../training-planner/training-planner.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Injury, User, SafetyTag]),
    forwardRef(() => TrainingPlannerModule),
  ],
  controllers: [InjuriesController],
  providers: [InjuriesService],
  exports: [InjuriesService],
})
export class InjuriesModule {}
