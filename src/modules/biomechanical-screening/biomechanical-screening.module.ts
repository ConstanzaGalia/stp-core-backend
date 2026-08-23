import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiomechanicalScreeningProtocol } from 'src/entities/biomechanical-screening-protocol.entity';
import { BiomechanicalScreeningSession } from 'src/entities/biomechanical-screening-session.entity';
import { BiomechanicalScreeningTestResult } from 'src/entities/biomechanical-screening-test-result.entity';
import { PhysicalEvaluationModule } from '../physical-evaluation/physical-evaluation.module';
import { BiomechanicalScreeningController } from './biomechanical-screening.controller';
import { BiomechanicalScreeningService } from './biomechanical-screening.service';
import { ScreeningScoringService } from './screening-scoring.service';
import { ScreeningBiomechanicalProfileService } from './screening-biomechanical-profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BiomechanicalScreeningProtocol,
      BiomechanicalScreeningSession,
      BiomechanicalScreeningTestResult,
    ]),
    PhysicalEvaluationModule,
  ],
  controllers: [BiomechanicalScreeningController],
  providers: [BiomechanicalScreeningService, ScreeningScoringService, ScreeningBiomechanicalProfileService],
  exports: [BiomechanicalScreeningService],
})
export class BiomechanicalScreeningModule {}
