export interface NormalizedTest {
  testType: string;
  metrics: Record<string, number[]>;
}

export interface DerivedVariables {
  cmj_height: number | null;
  cmj_braking_time: number | null;
  cmj_propulsive_force: number | null;
  dj_rsi: number | null;
  dj_contact_time: number | null;
  fatigue_index: number | null;
  asymmetry: number | null;
}

export const DERIVED_VAR_KEYS: (keyof DerivedVariables)[] = [
  'cmj_height',
  'cmj_braking_time',
  'cmj_propulsive_force',
  'dj_rsi',
  'dj_contact_time',
  'fatigue_index',
  'asymmetry',
];

export type CategoryName =
  | 'potencia'
  | 'reactividad'
  | 'estrategia'
  | 'resistencia'
  | 'asimetria'
  | 'global';

export const WEIGHTED_CATEGORIES: CategoryName[] = [
  'potencia',
  'reactividad',
  'estrategia',
  'resistencia',
  'asimetria',
];

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
  analysis: AnalysisSection;
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
