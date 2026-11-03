/**
 * Reglas de repeticiones de la plataforma de fuerza (Ivolution).
 *
 * Calculador único y puro: decide qué repeticiones valen, qué valor representa
 * a cada métrica, qué repeticiones son atípicas y qué tan confiable es el
 * resultado. No conoce pantallas ni backend: recibe repeticiones y devuelve
 * números. Toda regla y umbral vive en `RepRulesConfig`, versionado, para que
 * cada informe pueda guardar con qué reglas se calculó.
 */

export const REP_RULES_VERSION = 'reps-v1';

export interface RepRulesConfig {
  version: string;
  /** Repeticiones válidas para resultado confiable; por debajo es preliminar. */
  reliableValidReps: number;
  /** Tolerancia entre peso de una repetición y la mediana de todas (%). */
  weightTolerancePct: number;
  /** Tolerancia entre altura informada y altura derivada de la velocidad de despegue (%). */
  heightVsTakeoffTolerancePct: number;
  /** Variación (CV, %) entre repeticiones: estable < stable, aceptable < acceptable, si no variable. */
  cvStablePct: number;
  cvAcceptablePct: number;
  /** Repetición atípica: desvío relativo respecto de las demás y mínimo de repeticiones válidas. */
  atypicalDeviationPct: number;
  atypicalMinValidReps: number;
  /** Asimetría: promedio sin signo desde el cual es patrón / tendencia, y rango que la vuelve no interpretable. */
  asymmetryPatternPct: number;
  asymmetryTrendPct: number;
  asymmetryNotInterpretableRangePts: number;
}

export const DEFAULT_REP_RULES: RepRulesConfig = {
  version: REP_RULES_VERSION,
  reliableValidReps: 3,
  weightTolerancePct: 3,
  heightVsTakeoffTolerancePct: 3,
  cvStablePct: 5,
  cvAcceptablePct: 10,
  atypicalDeviationPct: 10,
  atypicalMinValidReps: 3,
  asymmetryPatternPct: 10,
  asymmetryTrendPct: 5,
  asymmetryNotInterpretableRangePts: 15,
};

export type RepOverride = 'include' | 'exclude' | null;

export interface RepInput {
  /** Posición de la repetición en el export (0-based). */
  index: number;
  metrics: Record<string, number | null | undefined>;
  /** Decisión del entrenador sobre esta repetición; null = sin decisión. */
  override?: RepOverride;
}

/** Estimador del valor que representa a la métrica. */
export type RepEstimator = 'mean' | 'best';

export interface RepMetricSpec {
  key: string;
  /** `asymmetry`: valor con signo; se promedia el valor absoluto y se informa el lado. */
  kind: 'state' | 'asymmetry';
  /** Solo para `state`. `best` = test de esfuerzo máximo aislado (McCall). Por defecto `mean`. */
  estimator?: RepEstimator;
  higherIsBetter?: boolean;
  /** Margen de error de la métrica (cambio mínimo detectable), en su unidad. */
  mdc?: number;
  /** Si participa de la detección de repeticiones atípicas. */
  usedForAtypical?: boolean;
}

export interface RepValidityKeys {
  weight?: string;
  /** Altura de salto en cm. */
  jumpHeightCm?: string;
  /** Velocidad de despegue en m/s. */
  takeoffVelocity?: string;
}

export type RepStatus = 'valid' | 'excluded_rule' | 'excluded_coach';

export interface RepAssessment {
  index: number;
  /** Resultado de las reglas objetivas, sin la decisión del entrenador. */
  autoValid: boolean;
  reasons: string[];
  override: RepOverride;
  status: RepStatus;
  included: boolean;
}

export type Stability = 'stable' | 'acceptable' | 'variable';

/** `single_rep`: una sola repetición válida, no alcanza para saber si el lado se sostiene. */
export type AsymmetryKind =
  | 'single_rep'
  | 'pattern'
  | 'trend'
  | 'small'
  | 'mixed_side'
  | 'not_interpretable';

/** Lado con mayor valor (la otra pierna aporta menos), según la convención configurada. */
export type AsymmetrySide = 'left' | 'right' | 'mixed';

export interface MetricSummary {
  key: string;
  kind: RepMetricSpec['kind'];
  estimator: RepEstimator | 'abs_mean';
  n: number;
  used: number | null;
  min: number | null;
  max: number | null;
  cv: number | null;
  stability: Stability | null;
  asymmetry?: {
    side: AsymmetrySide;
    kind: AsymmetryKind;
    minAbs: number;
    maxAbs: number;
  };
}

export interface AtypicalRep {
  index: number;
  hits: Array<{ key: string; deviationPct: number }>;
}

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface RepEvaluationResult {
  rulesVersion: string;
  reps: RepAssessment[];
  validCount: number;
  metrics: Record<string, MetricSummary>;
  atypical: AtypicalRep[];
  /** Confianza del resultado según repeticiones válidas y variación de la métrica principal. */
  confidence: Confidence;
  preliminary: boolean;
}

export interface EvaluateRepsOptions {
  specs: RepMetricSpec[];
  /** Clave de la métrica que define la confianza global (p. ej. altura de salto). */
  primaryKey: string;
  validity?: RepValidityKeys;
  /**
   * Convención de signo de las asimetrías de Ivolution. Con `negative_is_right_greater`
   * un valor negativo significa que la pierna derecha aporta más (la izquierda menos).
   * Se deduce de los exports (fuerza Der/Izq vs. porcentaje) y debe confirmarse con Ivolution.
   */
  signConvention?: 'negative_is_right_greater' | 'negative_is_left_greater';
  config?: RepRulesConfig;
}

const GRAVITY = 9.81;

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Reglas objetivas: una repetición nunca se descarta por «salir peor». */
export function assessRepObjectively(
  rep: RepInput,
  all: RepInput[],
  keys: RepValidityKeys | undefined,
  cfg: RepRulesConfig,
): string[] {
  const reasons: string[] = [];
  if (!keys) return reasons;

  if (keys.weight) {
    const w = rep.metrics[keys.weight];
    const weights = all.map((r) => r.metrics[keys.weight!]).filter(finite);
    if (finite(w) && weights.length >= 3) {
      const med = median(weights);
      if (med > 0 && (Math.abs(w - med) / med) * 100 > cfg.weightTolerancePct) {
        reasons.push('El peso medido difiere de las otras repeticiones.');
      }
    }
  }

  if (keys.jumpHeightCm && keys.takeoffVelocity) {
    const h = rep.metrics[keys.jumpHeightCm];
    const v = rep.metrics[keys.takeoffVelocity];
    if (finite(h) && finite(v) && h > 0) {
      const derived = ((v * v) / (2 * GRAVITY)) * 100;
      if ((Math.abs(derived - h) / h) * 100 > cfg.heightVsTakeoffTolerancePct) {
        reasons.push('La altura no coincide con la velocidad de despegue.');
      }
    }
  }

  return reasons;
}

function summarizeState(
  spec: RepMetricSpec,
  values: number[],
  cfg: RepRulesConfig,
): MetricSummary {
  const estimator: RepEstimator = spec.estimator ?? 'mean';
  const higher = spec.higherIsBetter ?? true;
  const base: MetricSummary = {
    key: spec.key,
    kind: 'state',
    estimator,
    n: values.length,
    used: null,
    min: null,
    max: null,
    cv: null,
    stability: null,
  };
  if (!values.length) return base;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const used = estimator === 'best' ? (higher ? max : min) : mean(values);
  const m = mean(values);
  const cv =
    values.length >= 2 && m !== 0
      ? (sampleSd(values) / Math.abs(m)) * 100
      : null;
  let stability: Stability | null = null;
  if (cv != null) {
    stability =
      cv < cfg.cvStablePct
        ? 'stable'
        : cv < cfg.cvAcceptablePct
          ? 'acceptable'
          : 'variable';
  }
  return { ...base, used, min, max, cv, stability };
}

function summarizeAsymmetry(
  spec: RepMetricSpec,
  values: number[],
  convention: NonNullable<EvaluateRepsOptions['signConvention']>,
  cfg: RepRulesConfig,
): MetricSummary {
  const base: MetricSummary = {
    key: spec.key,
    kind: 'asymmetry',
    estimator: 'abs_mean',
    n: values.length,
    used: null,
    min: null,
    max: null,
    cv: null,
    stability: null,
  };
  if (!values.length) return base;

  const abs = values.map(Math.abs);
  const used = mean(abs);
  const minAbs = Math.min(...abs);
  const maxAbs = Math.max(...abs);
  const allNeg = values.every((v) => v < 0);
  const allPos = values.every((v) => v > 0);
  const negativeSide: AsymmetrySide =
    convention === 'negative_is_right_greater' ? 'right' : 'left';
  const positiveSide: AsymmetrySide =
    negativeSide === 'right' ? 'left' : 'right';
  const side: AsymmetrySide = allNeg
    ? negativeSide
    : allPos
      ? positiveSide
      : 'mixed';

  const wide = maxAbs - minAbs > cfg.asymmetryNotInterpretableRangePts;
  let kind: AsymmetryKind;
  if (wide && values.length >= 2) kind = 'not_interpretable';
  else if (used < cfg.asymmetryTrendPct) kind = 'small';
  else if (values.length < 2) kind = 'single_rep';
  else if (side === 'mixed') kind = 'mixed_side';
  else if (used >= cfg.asymmetryPatternPct) kind = 'pattern';
  else kind = 'trend';

  return {
    ...base,
    used,
    min: minAbs,
    max: maxAbs,
    asymmetry: { side, kind, minAbs, maxAbs },
  };
}

/**
 * Repetición válida pero atípica: se aleja de las demás mientras estas están cerca entre sí.
 * Solo avisa; excluirla es decisión del entrenador.
 */
export function detectAtypicalReps(
  included: RepInput[],
  specs: RepMetricSpec[],
  cfg: RepRulesConfig,
): AtypicalRep[] {
  if (included.length < cfg.atypicalMinValidReps) return [];
  const result: AtypicalRep[] = [];

  for (const rep of included) {
    const hits: AtypicalRep['hits'] = [];
    for (const spec of specs) {
      if (spec.kind !== 'state' || !spec.usedForAtypical) continue;
      const own = rep.metrics[spec.key];
      if (!finite(own)) continue;
      const others = included
        .filter((r) => r.index !== rep.index)
        .map((r) => r.metrics[spec.key])
        .filter(finite);
      if (others.length < 2) continue;
      const ref = mean(others);
      if (ref === 0) continue;
      const deviation = Math.abs(own - ref) / Math.abs(ref);
      const spread =
        (Math.max(...others) - Math.min(...others)) / Math.abs(ref);
      const beyondNoise = Math.abs(own - ref) > (spec.mdc ?? 0);
      if (
        deviation * 100 > cfg.atypicalDeviationPct &&
        spread < deviation / 2 &&
        beyondNoise
      ) {
        hits.push({
          key: spec.key,
          deviationPct: ((own - ref) / Math.abs(ref)) * 100,
        });
      }
    }
    if (hits.length) result.push({ index: rep.index, hits });
  }
  return result;
}

function confidenceFor(
  validCount: number,
  primary: MetricSummary | undefined,
  cfg: RepRulesConfig,
): Confidence {
  if (validCount < 1) return 'insufficient';
  if (validCount < 2) return 'low';
  const cv = primary?.cv;
  if (validCount >= cfg.reliableValidReps && cv != null && cv < cfg.cvStablePct)
    return 'high';
  if (cv != null && cv < cfg.cvAcceptablePct * 0.8) return 'medium';
  return 'low';
}

export function evaluateRepetitions(
  reps: RepInput[],
  options: EvaluateRepsOptions,
): RepEvaluationResult {
  const cfg = options.config ?? DEFAULT_REP_RULES;
  const convention = options.signConvention ?? 'negative_is_right_greater';

  const assessments: RepAssessment[] = reps.map((rep) => {
    const reasons = assessRepObjectively(rep, reps, options.validity, cfg);
    const autoValid = reasons.length === 0;
    const override = rep.override ?? null;
    const included =
      override === 'include'
        ? true
        : override === 'exclude'
          ? false
          : autoValid;
    const status: RepStatus =
      override === 'exclude'
        ? 'excluded_coach'
        : included
          ? 'valid'
          : 'excluded_rule';
    return { index: rep.index, autoValid, reasons, override, status, included };
  });

  const includedIdx = new Set(
    assessments.filter((a) => a.included).map((a) => a.index),
  );
  const included = reps.filter((r) => includedIdx.has(r.index));

  const metrics: Record<string, MetricSummary> = {};
  for (const spec of options.specs) {
    const values = included.map((r) => r.metrics[spec.key]).filter(finite);
    metrics[spec.key] =
      spec.kind === 'asymmetry'
        ? summarizeAsymmetry(spec, values, convention, cfg)
        : summarizeState(spec, values, cfg);
  }

  const atypical = detectAtypicalReps(included, options.specs, cfg);
  const validCount = included.length;
  return {
    rulesVersion: cfg.version,
    reps: assessments,
    validCount,
    metrics,
    atypical,
    confidence: confidenceFor(validCount, metrics[options.primaryKey], cfg),
    preliminary: validCount < cfg.reliableValidReps,
  };
}

export type ChangeVerdict = 'improved' | 'worsened' | 'no_clear_change';

/** Un cambio se informa solo si supera el margen de error de la métrica. */
export function compareWithPrevious(
  current: number | null,
  previous: number | null,
  spec: Pick<RepMetricSpec, 'mdc' | 'higherIsBetter'>,
): { verdict: ChangeVerdict; delta: number | null } {
  if (!finite(current) || !finite(previous))
    return { verdict: 'no_clear_change', delta: null };
  const delta = current - previous;
  if (Math.abs(delta) < (spec.mdc ?? 0))
    return { verdict: 'no_clear_change', delta };
  const higher = spec.higherIsBetter ?? true;
  return { verdict: delta > 0 === higher ? 'improved' : 'worsened', delta };
}
