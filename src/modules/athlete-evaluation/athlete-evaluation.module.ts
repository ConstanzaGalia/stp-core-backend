import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AthleteEvaluation } from 'src/entities/athlete-evaluation.entity';
import { User } from 'src/entities/user.entity';
import { AthleteEvaluationController } from './athlete-evaluation.controller';
import { AthleteEvaluationService } from './athlete-evaluation.service';
import { CompanyModule } from '../company/company.module';
import { AthletesModule } from '../athletes/athletes.module';
import { PhysicalEvaluationModule } from '../physical-evaluation/physical-evaluation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AthleteEvaluation, User]),
    CompanyModule,
    AthletesModule,
    PhysicalEvaluationModule,
  ],
  controllers: [AthleteEvaluationController],
  providers: [AthleteEvaluationService],
  exports: [AthleteEvaluationService],
})
export class AthleteEvaluationModule {}
