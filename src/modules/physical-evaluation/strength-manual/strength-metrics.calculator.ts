import {
  MANUAL_STRENGTH_FORMULA_VERSION,
  MANUAL_STRENGTH_LIFTS,
  type ManualStrengthDerivedMetrics,
  type ManualStrengthLiftCode,
  type ManualStrengthLiftComputed,
  type ManualStrengthLiftInput,
} from './strength-manual.types';

/** Persist full precision for correlations; UI rounds for display. */
export function computeEstimated1rmKg(loadKg: number, reps: number, rir: number): number {
  const effectiveReps = reps + rir;
  return loadKg * (1 + effectiveReps / 30);
}

export function computeRelativeStrength(estimated1rmKg: number, bodyWeightKg: number): number {
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    throw new Error('bodyWeightKg must be a positive number');
  }
  return estimated1rmKg / bodyWeightKg;
}

export function isValidBodyWeightKg(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 25 && value <= 220;
}

export function computeLift(
  code: ManualStrengthLiftCode,
  input: ManualStrengthLiftInput,
  bodyWeightKg: number,
): ManualStrengthLiftComputed {
  const def = MANUAL_STRENGTH_LIFTS.find((l) => l.code === code);
  if (!def) throw new Error(`Unknown lift code: ${code}`);

  const estimated1rmKg = computeEstimated1rmKg(input.loadKg, input.reps, input.rir);
  const relativeStrength = computeRelativeStrength(estimated1rmKg, bodyWeightKg);

  return {
    code: def.code,
    testType: def.testType,
    label: def.label,
    loadKg: input.loadKg,
    reps: input.reps,
    rir: input.rir,
    bodyWeightKg,
    bodyWeightSource: 'user_profile',
    effectiveReps: input.reps + input.rir,
    estimated1rmKg,
    relativeStrength,
    formula: MANUAL_STRENGTH_FORMULA_VERSION,
  };
}

export function buildDerivedMetrics(
  lifts: ManualStrengthLiftComputed[],
  bodyWeightKg: number,
): ManualStrengthDerivedMetrics {
  const byCode = new Map(lifts.map((l) => [l.code, l]));
  const squat = byCode.get('squat') ?? null;
  const bench = byCode.get('bench') ?? null;
  const deadlift = byCode.get('deadlift') ?? null;

  const total =
    squat && bench && deadlift
      ? squat.estimated1rmKg + bench.estimated1rmKg + deadlift.estimated1rmKg
      : null;

  const meanRel =
    lifts.length > 0
      ? lifts.reduce((sum, l) => sum + l.relativeStrength, 0) / lifts.length
      : null;

  return {
    body_weight_kg: bodyWeightKg,
    squat_estimated_1rm_kg: squat?.estimated1rmKg ?? null,
    squat_relative_strength: squat?.relativeStrength ?? null,
    bench_estimated_1rm_kg: bench?.estimated1rmKg ?? null,
    bench_relative_strength: bench?.relativeStrength ?? null,
    deadlift_estimated_1rm_kg: deadlift?.estimated1rmKg ?? null,
    deadlift_relative_strength: deadlift?.relativeStrength ?? null,
    total_estimated_1rm_kg: total,
    mean_relative_strength: meanRel,
    lifts_completed: lifts.length,
  };
}

export function buildSummaryAnalysis(
  lifts: ManualStrengthLiftComputed[],
  derived: ManualStrengthDerivedMetrics,
): string {
  if (!lifts.length) return 'Sin lifts registrados.';

  const parts = lifts.map(
    (l) =>
      `${l.label}: ${l.loadKg} kg × ${l.reps} (RIR ${l.rir}) → e1RM ${l.estimated1rmKg.toFixed(1)} kg (${l.relativeStrength.toFixed(2)}× BW)`,
  );

  if (derived.total_estimated_1rm_kg != null) {
    parts.push(
      `Total e1RM: ${derived.total_estimated_1rm_kg.toFixed(1)} kg · Media relativa: ${derived.mean_relative_strength?.toFixed(2)}× BW`,
    );
  } else if (derived.mean_relative_strength != null) {
    parts.push(`Media relativa (${lifts.length}/3): ${derived.mean_relative_strength.toFixed(2)}× BW`);
  }

  return parts.join('\n');
}

export function liftMetricsPayload(lift: ManualStrengthLiftComputed): Record<string, unknown> {
  return {
    load_kg: lift.loadKg,
    reps: lift.reps,
    rir: lift.rir,
    body_weight_kg: lift.bodyWeightKg,
    body_weight_source: lift.bodyWeightSource,
    effective_reps: lift.effectiveReps,
    estimated_1rm_kg: lift.estimated1rmKg,
    relative_strength: lift.relativeStrength,
    formula: lift.formula,
  };
}
