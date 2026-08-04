/**
 * Catálogo curado de métricas para el dashboard del entrenador.
 * Las claves de derivedMetrics son exclusivas por familia de evaluación.
 */

export const COACH_DASHBOARD_DERIVED_KEYS = [
  // CMJ / plataforma de fuerza
  'cmj_height',
  'cmj_rsi',
  'force_to_body_weight_ratio',
  'fatigue_index',
  'asymmetry',
  'mccall_asymmetry_pct',
  // Fuerza manual (3 básicos)
  'squat_relative_strength',
  'bench_relative_strength',
  'deadlift_relative_strength',
  'mean_relative_strength',
  // Sprint / fotocélulas
  'avgVelocityMps',
  'bestTimeSeconds',
  'bestSprintSeconds',
  'fatigueIndexPct',
] as const;

export type CoachDashboardDerivedKey = (typeof COACH_DASHBOARD_DERIVED_KEYS)[number];

export const COACH_DASHBOARD_CAPACITY_KEYS = [
  'potencia',
  'reactividad',
  'fuerza',
  'estrategia',
  'resistencia',
  'asimetria',
] as const;

export type CoachDashboardCapacityKey = (typeof COACH_DASHBOARD_CAPACITY_KEYS)[number];

const DERIVED_KEY_SET = new Set<string>(COACH_DASHBOARD_DERIVED_KEYS);

export type CoachDashboardMetricRow = {
  userId: string;
  evaluationId: string;
  evaluationDate: string;
  metrics: Record<string, number | null>;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Proyecta solo las claves del catálogo desde derivedMetrics + categoryScores.
 * Prefija capacidades como `capacity_*`.
 */
export function projectCoachDashboardMetrics(
  derivedMetrics: Record<string, unknown> | null | undefined,
  structuredAnalysis: Record<string, unknown> | null | undefined,
): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};

  if (derivedMetrics && typeof derivedMetrics === 'object') {
    for (const [key, raw] of Object.entries(derivedMetrics)) {
      if (!DERIVED_KEY_SET.has(key)) continue;
      const num = asFiniteNumber(raw);
      if (num != null) metrics[key] = num;
    }
  }

  const categoryScores =
    structuredAnalysis &&
    typeof structuredAnalysis === 'object' &&
    structuredAnalysis.categoryScores &&
    typeof structuredAnalysis.categoryScores === 'object'
      ? (structuredAnalysis.categoryScores as Record<string, unknown>)
      : null;

  if (categoryScores) {
    for (const key of COACH_DASHBOARD_CAPACITY_KEYS) {
      const num = asFiniteNumber(categoryScores[key]);
      if (num != null) metrics[`capacity_${key}`] = num;
    }
  }

  return metrics;
}

export function hasAnyProjectedMetric(metrics: Record<string, number | null>): boolean {
  return Object.keys(metrics).length > 0;
}
