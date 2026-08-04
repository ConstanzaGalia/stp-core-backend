export const MANUAL_STRENGTH_PROTOCOL_CODE = 'big_three_manual';
export const MANUAL_STRENGTH_FORMULA_VERSION = 'epley_rir_v1';

export type ManualStrengthLiftCode = 'squat' | 'bench' | 'deadlift';

export type ManualStrengthTestType =
  | 'manual_squat'
  | 'manual_bench'
  | 'manual_deadlift';

export const MANUAL_STRENGTH_LIFTS: Array<{
  code: ManualStrengthLiftCode;
  testType: ManualStrengthTestType;
  label: string;
}> = [
  { code: 'squat', testType: 'manual_squat', label: 'Sentadilla' },
  { code: 'bench', testType: 'manual_bench', label: 'Press banca' },
  { code: 'deadlift', testType: 'manual_deadlift', label: 'Peso muerto' },
];

export interface ManualStrengthLiftInput {
  loadKg: number;
  reps: number;
  rir: number;
}

export interface ManualStrengthLiftComputed {
  code: ManualStrengthLiftCode;
  testType: ManualStrengthTestType;
  label: string;
  loadKg: number;
  reps: number;
  rir: number;
  bodyWeightKg: number;
  bodyWeightSource: 'user_profile';
  effectiveReps: number;
  estimated1rmKg: number;
  relativeStrength: number;
  formula: typeof MANUAL_STRENGTH_FORMULA_VERSION;
}

export interface ManualStrengthDerivedMetrics {
  body_weight_kg: number;
  squat_estimated_1rm_kg: number | null;
  squat_relative_strength: number | null;
  bench_estimated_1rm_kg: number | null;
  bench_relative_strength: number | null;
  deadlift_estimated_1rm_kg: number | null;
  deadlift_relative_strength: number | null;
  total_estimated_1rm_kg: number | null;
  mean_relative_strength: number | null;
  lifts_completed: number;
}

export interface ManualStrengthPreview {
  athleteId: string;
  evaluationDate: string;
  protocolCode: typeof MANUAL_STRENGTH_PROTOCOL_CODE;
  protocolLabel: string;
  bodyWeightKg: number;
  bodyWeightSource: 'user_profile';
  lifts: ManualStrengthLiftComputed[];
  derivedMetrics: ManualStrengthDerivedMetrics;
  completeness: number;
  summaryAnalysis: string;
  warnings: string[];
}
