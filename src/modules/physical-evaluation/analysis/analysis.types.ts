export interface NormalizedTest {
  testType: string;
  metrics: Record<string, number[]>;
}

export interface DerivedVariables {
  cmj_height: number | null;
  cmj_braking_time: number | null;
  cmj_braking_force: number | null;
  cmj_propulsive_force: number | null;
  cmj_propulsive_power: number | null;
  dj_rsi: number | null;
  dj_contact_time: number | null;
  cmj_rsi: number | null;
  cmj_contact_time: number | null;
  reactive_rsi: number | null;
  reactive_contact_time: number | null;
  sj_height: number | null;
  elasticity_index: number | null;
  body_weight_kg: number | null;
  mccall_peak_force: number | null;
  mccall_peak_force_left: number | null;
  mccall_peak_force_right: number | null;
  mccall_asymmetry_pct: number | null;
  force_to_body_weight_ratio: number | null;
  fatigue_index: number | null;
  asymmetry: number | null;
}

export const DERIVED_VAR_KEYS: (keyof DerivedVariables)[] = [
  'cmj_height',
  'cmj_braking_time',
  'cmj_braking_force',
  'cmj_propulsive_force',
  'cmj_propulsive_power',
  'dj_rsi',
  'dj_contact_time',
  'cmj_rsi',
  'cmj_contact_time',
  'reactive_rsi',
  'reactive_contact_time',
  'sj_height',
  'elasticity_index',
  'body_weight_kg',
  'mccall_peak_force',
  'mccall_peak_force_left',
  'mccall_peak_force_right',
  'mccall_asymmetry_pct',
  'force_to_body_weight_ratio',
  'fatigue_index',
  'asymmetry',
];

export type CategoryName =
  | 'potencia'
  | 'reactividad'
  | 'fuerza'
  | 'estrategia'
  | 'resistencia'
  | 'asimetria'
  | 'global';

export const RADAR_CATEGORY_NAMES: CategoryName[] = [
  'potencia',
  'reactividad',
  'fuerza',
  'estrategia',
  'resistencia',
  'asimetria',
];

/** Categorías que entran en el promedio global (excluye `global`). */
export const WEIGHTED_CATEGORIES: CategoryName[] = RADAR_CATEGORY_NAMES.filter((c) => c !== 'global');

export type Severity = 'alta' | 'media' | 'baja';

export interface EvaluationRuleConfig {
  id: string;
  category: CategoryName;
  condition: string;
  severity: Severity;
  score_impact: number;
  message: string;
  recommendation: string;
}

export interface ParsedClause {
  variable: string;
  operator: '<' | '>' | '<=' | '>=' | '==';
  value: number;
}

export interface TriggeredRule {
  rule: EvaluationRuleConfig;
  actualValues: Record<string, number>;
}

export type CategoryScores = Record<CategoryName, number | null>;

export type OverallLevel = 'low' | 'medium' | 'high';

export interface ScoringResult {
  categoryScores: CategoryScores;
  totalScore: number;
  level: OverallLevel;
}

export interface AnalysisSection {
  profile: string;
  strengths: string[];
  weaknesses: string[];
  mainLimiter: string | null;
  recommendations: string[];
}

export type StrategyType =
  | 'fuerte_lento'
  | 'rapido_debil'
  | 'equilibrado'
  | 'deficit_global'
  | 'intermedio';

export interface StrategyBlock {
  type: StrategyType;
  title: string;
  justification: string;
  recommendation: string;
  potenciaScore: number | null;
  reactividadScore: number | null;
}

export interface TrainingDecision {
  priorities: string[];
  restrictions: string[];
  suggestedPhase: string | null;
  exerciseHints: {
    prioritize: string[];
    avoid: string[];
  };
}

export interface StructuredAnalysis {
  version: string;
  derivedVariables: DerivedVariables;
  triggeredRules: {
    id: string;
    category: CategoryName;
    severity: Severity;
    message: string;
    recommendation: string;
    score_impact: number;
    actualValues: Record<string, number>;
  }[];
  categoryScores: CategoryScores;
  totalScore: number;
  level: OverallLevel;
  warnings: string[];
  completeness: number | null;
  strategy: StrategyBlock | null;
  trainingDecision: TrainingDecision | null;
  analysis: AnalysisSection;
}

export interface NormativeThresholds {
  cmj_height_cm: [number, number, number, number];
  propulsive_force_n: [number, number, number, number];
  propulsive_power: [number, number, number, number];
  rsi: [number, number, number, number];
  contact_time_s: [number, number, number, number];
  braking_force_n: [number, number, number, number];
  braking_time_s: [number, number, number, number];
  fatigue_index: [number, number, number, number];
  asymmetry_pct: [number, number, number, number];
  elasticity_pct: [number, number, number, number];
  force_bw_ratio: [number, number, number, number];
}

export interface NormativesConfigFile {
  version: string;
  description: string;
  thresholds: NormativeThresholds;
}

export interface RulesConfigFile {
  version: string;
  description: string;
  variables: string[];
  categories: string[];
  rules: EvaluationRuleConfig[];
  scoring: {
    weights: Record<string, number>;
  };
  levels: Record<string, { min: number; max: number }>;
}

export interface FullAnalysisResult {
  summaryScore: number | null;
  summaryAnalysis: string;
  structuredAnalysis: StructuredAnalysis;
}
