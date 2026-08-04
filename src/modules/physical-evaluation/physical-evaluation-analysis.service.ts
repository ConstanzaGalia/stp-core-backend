import { Injectable } from '@nestjs/common';
import { CmjTestAnalyzer } from './analyzers/cmj-test.analyzer';
import { DefaultPhysicalTestAnalyzer } from './analyzers/default-test.analyzer';
import { DropJumpTestAnalyzer } from './analyzers/drop-jump-test.analyzer';
import type { PhysicalTestAnalyzer } from './analyzers/test-analyzer.interface';
import type { PhysicalTestInput } from './physical-evaluation.types';
import type {
  CategoryScores,
  DerivedVariables,
  FullAnalysisResult,
  StrategyBlock,
  StructuredAnalysis,
} from './analysis/analysis.types';
import { DERIVED_VAR_KEYS } from './analysis/analysis.types';
import { MetricsNormalizerService } from './analysis/metrics-normalizer.service';
import { DerivedVariablesService } from './analysis/derived-variables.service';
import { RulesEngineService } from './analysis/rules-engine.service';
import { CapacityScoringService } from './analysis/capacity-scoring.service';
import { AnalysisGeneratorService } from './analysis/analysis-generator.service';
import { TrainingDecisionService } from './analysis/training-decision.service';

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
    private readonly trainingDecision: TrainingDecisionService,
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
    const { categoryScores, totalScore, level } = this.scoring.score(derived, config);
    const analysis = this.analysisGen.generate(derived, triggered, categoryScores, totalScore, level);
    const narrativeText = this.analysisGen.generateNarrativeText(analysis);

    const perTestBlocks = this.buildPerTestDetail(tests);

    const summaryScore = Math.round(totalScore * 20);
    const summaryAnalysis = narrativeText + '\n\n---\n\n' + perTestBlocks;

    const testTypes = tests.map((t) => t.testType.trim().toLowerCase());
    const warnings = this.buildWarnings(derived, testTypes);
    const completeness = this.computeCompleteness(derived, testTypes);
    const strategy = this.buildStrategy(categoryScores);
    const trainingDecision = this.trainingDecision.build(triggered, categoryScores);

    const structuredAnalysis: StructuredAnalysis = {
      version: '1.1',
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
      warnings,
      completeness,
      strategy,
      trainingDecision,
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

  private buildWarnings(d: DerivedVariables, testTypes: string[]): string[] {
    const w: string[] = [];
    const hasSj = testTypes.some((t) =>
      ['squat_jump', 'sq_jump', 'squatjump', 'sj'].includes(t),
    );
    const hasDj = testTypes.some((t) => ['drop_jump', 'dropjump', 'dj'].includes(t));
    const hasMccall = testTypes.some(
      (t) => t.includes('mccall') || t.includes('imtp') || t === 'isometric_mid_thigh_pull',
    );
    const hasCmj = testTypes.some(
      (t) => t.includes('cmj') || t === 'custom' || t === 'unknown' || t === '',
    );

    if (d.body_weight_kg == null && d.mccall_peak_force != null) {
      w.push('Sin peso corporal válido en CSV: no se calculó fuerza relativa (N/kg).');
    }
    // Solo advertir SJ faltante si el atleta subió más de un tipo esperado o ya hay CMJ+intento de elasticidad
    if (hasSj === false && hasCmj && hasDj === false && hasMccall === false) {
      // Protocolo solo CMJ: no es advertencia
    } else if (d.elasticity_index == null && d.cmj_height != null && d.sj_height == null && hasSj) {
      w.push('Falta altura de Squat Jump: índice de elasticidad CMJ-SJ no calculado.');
    }
    // RSI: solo advertir si hay CMJ/DJ y realmente falta el valor
    if ((hasCmj || hasDj) && d.reactive_rsi == null) {
      w.push('Sin RSI en el archivo: la reactividad en reglas puede quedar limitada.');
    }
    return w;
  }

  private computeCompleteness(d: DerivedVariables, testTypes: string[]): number {
    const hasSj = testTypes.some((t) =>
      ['squat_jump', 'sq_jump', 'squatjump', 'sj'].includes(t),
    );
    const hasDj = testTypes.some((t) => ['drop_jump', 'dropjump', 'dj'].includes(t));
    const hasMccall = testTypes.some(
      (t) => t.includes('mccall') || t.includes('imtp') || t === 'isometric_mid_thigh_pull',
    );
    const hasCmj = testTypes.some(
      (t) => t.includes('cmj') || t === 'custom' || t === 'unknown' || t === '',
    );

    const keys: (keyof DerivedVariables)[] = [];
    if (hasCmj || (!hasSj && !hasDj && !hasMccall)) {
      keys.push('cmj_height', 'reactive_rsi', 'cmj_propulsive_force', 'asymmetry');
    }
    if (hasDj) keys.push('reactive_rsi');
    if (hasSj) keys.push('sj_height', 'elasticity_index');
    if (hasMccall) keys.push('mccall_peak_force');
    if (!keys.length) {
      keys.push('cmj_height', 'reactive_rsi', 'cmj_propulsive_force', 'asymmetry');
    }

    const unique = [...new Set(keys)];
    let ok = 0;
    for (const k of unique) {
      if (d[k] != null) ok++;
    }
    return Math.round((ok / unique.length) * 100);
  }

  private buildStrategy(scores: CategoryScores): StrategyBlock | null {
    const p = scores.potencia;
    const r = scores.reactividad;
    const f = scores.fuerza;
    if (p == null || r == null) return null;

    if (f != null && f >= 4 && r <= 2) {
      return {
        type: 'fuerte_lento',
        title: 'Fuerte pero poco reactivo',
        justification: 'Fuerza estructural alta y reactividad baja.',
        recommendation: 'Priorizar pliometría progresiva, drop jumps bajos y contrastes.',
        potenciaScore: p,
        reactividadScore: r,
      };
    }
    if (f != null && f <= 2 && r >= 4) {
      return {
        type: 'rapido_debil',
        title: 'Reactivo con déficit de fuerza',
        justification: 'Buena reactividad con fuerza limitada.',
        recommendation: 'Refuerzo de fuerza máxima e isometrías.',
        potenciaScore: p,
        reactividadScore: r,
      };
    }
    if (p <= 2 && r <= 2 && (f == null || f <= 2)) {
      return {
        type: 'deficit_global',
        title: 'Déficit global',
        justification: 'Potencia y reactividad por debajo del rango objetivo.',
        recommendation: 'Base de fuerza, coordinación y volumen controlado.',
        potenciaScore: p,
        reactividadScore: r,
      };
    }
    if (p >= 3 && r >= 3 && (f == null || f >= 3)) {
      return {
        type: 'equilibrado',
        title: 'Perfil equilibrado',
        justification: 'Capacidades alineadas en rango funcional.',
        recommendation: 'Mantener y orientar a demandas específicas del deporte.',
        potenciaScore: p,
        reactividadScore: r,
      };
    }
    return {
      type: 'intermedio',
      title: 'Perfil intermedio',
      justification: 'Combinación mixta; revisar limitante principal en radar y reglas.',
      recommendation: 'Priorizar la categoría con menor score.',
      potenciaScore: p,
      reactividadScore: r,
    };
  }

  private emptyDerived(): DerivedVariables {
    const o = {} as DerivedVariables;
    for (const k of DERIVED_VAR_KEYS) o[k] = null;
    return o;
  }

  private emptyStructuredAnalysis(): StructuredAnalysis {
    return {
      version: '1.1',
      derivedVariables: this.emptyDerived(),
      triggeredRules: [],
      categoryScores: {
        potencia: null,
        reactividad: null,
        fuerza: null,
        estrategia: null,
        resistencia: null,
        asimetria: null,
        global: null,
      },
      totalScore: 0,
      level: 'low',
      warnings: [],
      completeness: null,
      strategy: null,
      trainingDecision: null,
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
