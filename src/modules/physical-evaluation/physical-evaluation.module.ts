import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhysicalEvaluation } from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from 'src/entities/physical-evaluation-test.entity';
import { User } from 'src/entities/user.entity';
import { CompanyModule } from '../company/company.module';
import { AthletesModule } from '../athletes/athletes.module';
import { PhysicalEvaluationController } from './physical-evaluation.controller';
import { EvaluacionesController } from './evaluaciones.controller';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import { PhysicalEvaluationAnalysisService } from './physical-evaluation-analysis.service';
import { EvaluacionesFilesService } from './evaluaciones-files.service';
import { TestTypeFromFileService } from './test-type-from-file.service';
import { FileMetricsExtractionService } from './file-metrics-extraction.service';
import { MetricsNormalizerService } from './analysis/metrics-normalizer.service';
import { DerivedVariablesService } from './analysis/derived-variables.service';
import { RulesEngineService } from './analysis/rules-engine.service';
import { CapacityScoringService } from './analysis/capacity-scoring.service';
import { AnalysisGeneratorService } from './analysis/analysis-generator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhysicalEvaluation, PhysicalEvaluationTest, User]),
    CompanyModule,
    AthletesModule,
  ],
  controllers: [PhysicalEvaluationController, EvaluacionesController],
  providers: [
    PhysicalEvaluationService,
    PhysicalEvaluationAnalysisService,
    EvaluacionesFilesService,
    TestTypeFromFileService,
    FileMetricsExtractionService,
    MetricsNormalizerService,
    DerivedVariablesService,
    RulesEngineService,
    CapacityScoringService,
    AnalysisGeneratorService,
  ],
  exports: [PhysicalEvaluationService],
})
export class PhysicalEvaluationModule {}
