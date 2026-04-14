import { Injectable } from '@nestjs/common';
import { CmjTestAnalyzer } from './analyzers/cmj-test.analyzer';
import { DefaultPhysicalTestAnalyzer } from './analyzers/default-test.analyzer';
import { DropJumpTestAnalyzer } from './analyzers/drop-jump-test.analyzer';
import type { PhysicalTestAnalyzer } from './analyzers/test-analyzer.interface';
import type { PhysicalTestInput } from './physical-evaluation.types';
import type { FullAnalysisResult, StructuredAnalysis } from './analysis/analysis.types';
import { MetricsNormalizerService } from './analysis/metrics-normalizer.service';
import { DerivedVariablesService } from './analysis/derived-variables.service';
import { RulesEngineService } from './analysis/rules-engine.service';
import { CapacityScoringService } from './analysis/capacity-scoring.service';
import { AnalysisGeneratorService } from './analysis/analysis-generator.service';

@Injectable()
export class PhysicalEvaluationAnalysisService {
  private readonly specificAnalyzers: PhysicalTestAnalyzer[] = [
    new CmjTestAnalyzer(),
    new DropJumpTestAnalyzer(),
  ];

  private readonly fallback = new DefaultPhysicalTestAnalyzer();

  constructor(
    private readonly normalizer: MetricsNormalizerService,
    private readonly derivedVars: DerivedVariablesService,
    private readonly rulesEngine: RulesEngineService,
    private readonly scoring: CapacityScoringService,
    private readonly analysisGen: AnalysisGeneratorService,
  ) {}

  private resolveAnalyzer(testType: string): PhysicalTestAnalyzer {
    const t = testType.trim().toLowerCase();
    for (const a of this.specificAnalyzers) {
      if (a.testTypes.some((x) => x.toLowerCase() === t)) return a;
    }
    return this.fallback;
  }

  analyze(tests: PhysicalTestInput[]): FullAnalysisResult {
    if (!tests.length) {
      return {
        summaryScore: null,
        summaryAnalysis: 'No hay tests en esta evaluación.',
        structuredAnalysis: this.emptyStructuredAnalysis(),
      };
    }

    const normalized = this.normalizer.normalize(tests);
    const derived = this.derivedVars.compute(normalized);
    const triggered = this.rulesEngine.evaluate(derived);
    const config = this.rulesEngine.getConfig();
    const { categoryScores, totalScore, level } = this.scoring.score(triggered, config);
    const analysis = this.analysisGen.generate(derived, triggered, categoryScores, totalScore, level);
    const narrativeText = this.analysisGen.generateNarrativeText(analysis);

    const perTestBlocks = this.buildPerTestDetail(tests);

    const summaryScore = Math.round(totalScore * 20);
    const summaryAnalysis = narrativeText + '\n\n---\n\n' + perTestBlocks;

    const structuredAnalysis: StructuredAnalysis = {
      version: '1.0',
      derivedVariables: derived,
      triggeredRules: triggered.map((t) => ({
        id: t.rule.id,
        category: t.rule.category,
        severity: t.rule.severity,
        message: t.rule.message,
        recommendation: t.rule.recommendation,
        score_impact: t.rule.score_impact,
        actualValues: t.actualValues,
      })),
      categoryScores,
      totalScore,
      level,
      analysis,
    };

    return { summaryScore, summaryAnalysis, structuredAnalysis };
  }

  private buildPerTestDetail(tests: PhysicalTestInput[]): string {
    const blocks: string[] = [];
    for (const test of tests) {
      const analyzer = this.resolveAnalyzer(test.testType);
      const part = analyzer.analyze(test);
      blocks.push(part.lines.join('\n'));
    }
    return blocks.join('\n\n---\n\n');
  }

  private emptyStructuredAnalysis(): StructuredAnalysis {
    return {
      version: '1.0',
      derivedVariables: {
        cmj_height: null,
        cmj_braking_time: null,
        cmj_propulsive_force: null,
        dj_rsi: null,
        dj_contact_time: null,
        fatigue_index: null,
        asymmetry: null,
      },
      triggeredRules: [],
      categoryScores: {
        potencia: null,
        reactividad: null,
        estrategia: null,
        resistencia: null,
        asimetria: null,
        global: null,
      },
      totalScore: 0,
      level: 'low',
      analysis: {
        profile: 'No hay tests en esta evaluación.',
        strengths: [],
        weaknesses: [],
        mainLimiter: null,
        recommendations: [],
      },
    };
  }
}
