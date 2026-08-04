import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhysicalEvaluation } from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from 'src/entities/physical-evaluation-test.entity';
import { PhysicalEvaluationMeasurement } from 'src/entities/physical-evaluation-measurement.entity';
import { AthleteEvaluation } from 'src/entities/athlete-evaluation.entity';
import { EvaluationProtocol } from 'src/entities/evaluation-protocol.entity';
import { EvaluationCriteriaSet } from 'src/entities/evaluation-criteria-set.entity';
import { User } from 'src/entities/user.entity';
import { CompanyModule } from '../company/company.module';
import { AthletesModule } from '../athletes/athletes.module';
import { PhysicalEvaluationController } from './physical-evaluation.controller';
import { EvaluacionesController } from './evaluaciones.controller';
import { EvaluationProtocolController } from './evaluation-protocol.controller';
import { EvaluationCriteriaSetController } from './evaluation-criteria-set.controller';
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
import { TrainingDecisionService } from './analysis/training-decision.service';
import { AiAnalysisService } from './ai-analysis.service';
import { PhotocellImportService } from './photocell-import.service';
import { StrengthManualService } from './strength-manual/strength-manual.service';
import { EvaluationProtocolService } from './evaluation-protocol.service';
import { EvaluationCriteriaSetService } from './evaluation-criteria-set.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PhysicalEvaluation,
      PhysicalEvaluationTest,
      PhysicalEvaluationMeasurement,
      EvaluationProtocol,
      EvaluationCriteriaSet,
      User,
      AthleteEvaluation,
    ]),
    CompanyModule,
    AthletesModule,
  ],
  controllers: [
    PhysicalEvaluationController,
    EvaluacionesController,
    EvaluationProtocolController,
    EvaluationCriteriaSetController,
  ],
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
    TrainingDecisionService,
    AiAnalysisService,
    PhotocellImportService,
    StrengthManualService,
    EvaluationProtocolService,
    EvaluationCriteriaSetService,
  ],
  exports: [PhysicalEvaluationService, EvaluationProtocolService, EvaluationCriteriaSetService],
})
export class PhysicalEvaluationModule {}
