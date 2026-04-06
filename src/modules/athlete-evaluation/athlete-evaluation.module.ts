import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AthleteEvaluation } from 'src/entities/athlete-evaluation.entity';
import { User } from 'src/entities/user.entity';
import { AthleteEvaluationController } from './athlete-evaluation.controller';
import { AthleteEvaluationService } from './athlete-evaluation.service';

@Module({
  imports: [TypeOrmModule.forFeature([AthleteEvaluation, User])],
  controllers: [AthleteEvaluationController],
  providers: [AthleteEvaluationService],
  exports: [AthleteEvaluationService],
})
export class AthleteEvaluationModule {}
