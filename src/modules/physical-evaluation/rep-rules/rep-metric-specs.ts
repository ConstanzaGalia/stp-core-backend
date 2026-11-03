import {
  evaluateRepetitions,
  type RepEvaluationResult,
  type RepInput,
  type RepMetricSpec,
  type RepOverride,
  type RepValidityKeys,
} from './evaluation-rep-rules';

/** Familia de test para la que existen reglas de repeticiones. */
export type RepTestFamily = 'cmj' | 'drop_jump' | 'mccall' | 'squat_jump';

/** Entrada del registro de decisiones del entrenador (append-only; manda la última por repetición). */
export interface RepDecisionEntry {
  index: number;
  override: RepOverride;
  by: string | null;
  at: string;
  reason: string | null;
}

interface FamilySpec {
  primaryKey: string;
  metrics: Array<RepMetricSpec & { aliases: string[] }>;
  validity: { weight?: string[]; takeoffVelocity?: string[] };
  /** Asimetrías informadas que se pueden recalcular con las fuerzas por pierna del mismo export. */
  asymmetryChecks?: Array<{
    asymmetryKey: string;
    left: string[];
    right: string[];
  }>;
}

/** Diferencia tolerada (en puntos) entre la asimetría informada y la recalculada. */
const ASYMMETRY_CHECK_TOLERANCE_PTS = 3;

const HEIGHT_ALIASES = [
  'altura_de_salto',
  'altura_salto',
  'jump_height',
  'jump_height_cm',
  'altura',
];
const WEIGHT_ALIASES = [
  'peso_corporal',
  'peso',
  'body_weight',
  'body_weight_kg',
];
const TAKEOFF_ALIASES = [
  'velocidad_maxima_de_despegue',
  'vel_max_despegue',
  'velocidad_maxima_despegue',
  'takeoff_velocity',
];

const FAMILIES: Record<RepTestFamily, FamilySpec> = {
  cmj: {
    primaryKey: 'altura_de_salto',
    validity: { weight: WEIGHT_ALIASES, takeoffVelocity: TAKEOFF_ALIASES },
    asymmetryChecks: [
      {
        asymmetryKey: 'asimetria_frenado',
        left: ['fuerza_max_frenado_izq'],
        right: ['fuerza_max_frenado_der'],
      },
      {
        asymmetryKey: 'asimetria_propulsiva',
        left: ['fuerza_max_propulsiva_izq'],
        right: ['fuerza_max_propulsiva_der'],
      },
      {
        asymmetryKey: 'asimetria_aterrizaje',
        left: ['fuerza_max_aterrizaje_izq'],
        right: ['fuerza_max_aterrizaje_der'],
      },
    ],
    metrics: [
      {
        key: 'altura_de_salto',
        aliases: HEIGHT_ALIASES,
        kind: 'state',
        higherIsBetter: true,
        mdc: 1.2,
        usedForAtypical: true,
      },
      {
        key: 'rsi',
        aliases: ['rsi_mod', 'rsimod', 'rsi', 'reactive_strength_index'],
        kind: 'state',
        higherIsBetter: true,
        usedForAtypical: true,
      },
      {
        key: 'eficiencia',
        aliases: ['eficiencia', 'eficiencia_tvtc', 'eficiencia_tv_tc'],
        kind: 'state',
        higherIsBetter: true,
      },
      {
        key: 'tiempo_estabilizacion',
        aliases: ['tiempo_estabilizacion', 'tiempo_de_estabilizacion'],
        kind: 'state',
        higherIsBetter: false,
      },
      {
        key: 'asimetria_frenado',
        aliases: ['asimetria_frenado', 'asimetria_de_frenado'],
        kind: 'asymmetry',
      },
      {
        key: 'asimetria_propulsiva',
        aliases: [
          'asimetria_propulsiva',
          'asimetria_de_impulso',
          'asimetria_impulso',
        ],
        kind: 'asymmetry',
      },
      {
        key: 'asimetria_aterrizaje',
        aliases: ['asimetria_aterrizaje', 'asimetria_de_aterrizaje'],
        kind: 'asymmetry',
      },
    ],
  },
  drop_jump: {
    primaryKey: 'rsi',
    validity: { weight: WEIGHT_ALIASES },
    asymmetryChecks: [
      {
        asymmetryKey: 'asimetria_fuerza_pico',
        left: ['fuerza_pico_izquierda'],
        right: ['fuerza_pico_derecha'],
      },
    ],
    metrics: [
      {
        key: 'rsi',
        aliases: ['rsi', 'rsi_dj', 'reactive_strength_index'],
        kind: 'state',
        higherIsBetter: true,
        usedForAtypical: true,
      },
      {
        key: 'altura_de_salto',
        aliases: HEIGHT_ALIASES,
        kind: 'state',
        higherIsBetter: true,
        mdc: 1.2,
        usedForAtypical: true,
      },
      {
        key: 'tiempo_contacto',
        aliases: ['tiempo_de_contacto', 'tiempo_contacto', 'contact_time'],
        kind: 'state',
        higherIsBetter: false,
      },
      {
        key: 'asimetria_aterrizaje',
        aliases: ['asimetria_aterrizaje', 'asimetria_de_aterrizaje'],
        kind: 'asymmetry',
      },
      {
        key: 'asimetria_fuerza_pico',
        aliases: ['asimetria_fuerza_pico'],
        kind: 'asymmetry',
      },
    ],
  },
  mccall: {
    primaryKey: 'fuerza_isometrica',
    validity: {},
    metrics: [
      {
        key: 'fuerza_isometrica',
        aliases: [
          'fuerza_max_propulsiva',
          'max_propulsive_force',
          'peak_force',
          'fuerza_pico',
          'fuerza_maxima',
        ],
        kind: 'state',
        estimator: 'best',
        higherIsBetter: true,
        usedForAtypical: true,
      },
    ],
  },
  squat_jump: {
    primaryKey: 'altura_de_salto',
    validity: { weight: WEIGHT_ALIASES, takeoffVelocity: TAKEOFF_ALIASES },
    metrics: [
      {
        key: 'altura_de_salto',
        aliases: HEIGHT_ALIASES,
        kind: 'state',
        higherIsBetter: true,
        mdc: 1.2,
        usedForAtypical: true,
      },
    ],
  },
};

/** null = test sin reglas de repeticiones (p. ej. unilaterales, fotocélulas, fuerza manual). */
export function repTestFamily(testType: string): RepTestFamily | null {
  const t = String(testType ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/unilateral/.test(t)) return null;
  if (/mccall/.test(t)) return 'mccall';
  if (/drop|^dj$/.test(t)) return 'drop_jump';
  if (/squat|^sj$|^sq_jump$/.test(t)) return 'squat_jump';
  if (/cmj|countermovement/.test(t)) return 'cmj';
  return null;
}

function pickNumber(
  metrics: Record<string, unknown>,
  aliases: string[],
): number | null {
  for (const alias of aliases) {
    const raw = metrics[alias];
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw.replace(',', '.'))
          : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Ivolution exporta alturas en metros o en centímetros según el protocolo. */
function heightToCm(value: number | null): number | null {
  if (value == null) return null;
  return value > 0 && value < 1 ? value * 100 : value;
}

function lastOverrides(
  decisions: RepDecisionEntry[],
): Map<number, RepOverride> {
  const map = new Map<number, RepOverride>();
  for (const d of decisions) map.set(d.index, d.override);
  return map;
}

/** Dato del export que no cierra con el resto del mismo export; avisa, no excluye. */
export interface RepDataWarning {
  index: number;
  key: string;
  reported: number;
  computed: number;
  message: string;
}

export interface TestRepEvaluation extends RepEvaluationResult {
  family: RepTestFamily;
  dataWarnings: RepDataWarning[];
}

/**
 * Convención de Ivolution (confirmada con tres exports): positivo = izquierda mayor,
 * negativo = derecha mayor, sobre el mayor de los dos valores.
 */
function collectDataWarnings(
  spec: FamilySpec,
  repetitions: Array<Record<string, unknown>>,
): RepDataWarning[] {
  const warnings: RepDataWarning[] = [];
  for (const check of spec.asymmetryChecks ?? []) {
    const asymmetryAliases =
      spec.metrics.find((m) => m.key === check.asymmetryKey)?.aliases ?? [];
    repetitions.forEach((rep, index) => {
      const raw = (rep.metrics ?? {}) as Record<string, unknown>;
      const reported = pickNumber(raw, asymmetryAliases);
      const left = pickNumber(raw, check.left);
      const right = pickNumber(raw, check.right);
      if (reported == null || left == null || right == null) return;
      const peak = Math.max(left, right);
      if (peak <= 0) return;
      const computed = ((left - right) / peak) * 100;
      if (Math.abs(computed - reported) > ASYMMETRY_CHECK_TOLERANCE_PTS) {
        warnings.push({
          index,
          key: check.asymmetryKey,
          reported,
          computed,
          message: `La asimetría informada (${reported.toFixed(1).replace('.', ',')} %) no coincide con la que surge de las fuerzas por pierna (${Math.abs(computed).toFixed(1).replace('.', ',')} %).`,
        });
      }
    });
  }
  return warnings;
}

export function evaluateTestRepetitions(
  testType: string,
  repetitions: Array<Record<string, unknown>> | null | undefined,
  decisions: RepDecisionEntry[] = [],
): TestRepEvaluation | null {
  const family = repTestFamily(testType);
  if (!family || !repetitions?.length) return null;
  const spec = FAMILIES[family];
  const overrides = lastOverrides(decisions);

  const reps: RepInput[] = repetitions.map((rep, index) => {
    const raw = (rep.metrics ?? {}) as Record<string, unknown>;
    const metrics: Record<string, number | null> = {};
    for (const m of spec.metrics) {
      const value = pickNumber(raw, m.aliases);
      metrics[m.key] = m.key === 'altura_de_salto' ? heightToCm(value) : value;
    }
    metrics.__peso = spec.validity.weight
      ? pickNumber(raw, spec.validity.weight)
      : null;
    metrics.__vel_despegue = spec.validity.takeoffVelocity
      ? pickNumber(raw, spec.validity.takeoffVelocity)
      : null;
    return { index, metrics, override: overrides.get(index) ?? null };
  });

  const validity: RepValidityKeys = {
    weight: '__peso',
    takeoffVelocity: '__vel_despegue',
    jumpHeightCm: spec.metrics.some((m) => m.key === 'altura_de_salto')
      ? 'altura_de_salto'
      : undefined,
  };

  const result = evaluateRepetitions(reps, {
    specs: spec.metrics.map(({ aliases: _aliases, ...s }) => s),
    primaryKey: spec.primaryKey,
    validity,
  });
  return {
    ...result,
    family,
    dataWarnings: collectDataWarnings(spec, repetitions),
  };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Métricas del test con el valor que dejan las reglas de repeticiones: promedio de las
 * repeticiones incluidas (mejor intento en McCall). Conserva claves y unidades del export,
 * para que el análisis existente (semáforos, historial) lea los mismos nombres de siempre.
 * Sin repeticiones, sin reglas o sin ninguna válida, devuelve las métricas originales.
 */
export function buildEffectiveMetrics(
  testType: string,
  metrics: Record<string, unknown>,
  repetitions: Array<Record<string, unknown>> | null | undefined,
  decisions: RepDecisionEntry[] = [],
): Record<string, unknown> {
  const evaluation = evaluateTestRepetitions(testType, repetitions, decisions);
  if (!evaluation || !repetitions || evaluation.validCount === 0)
    return metrics;
  if (evaluation.reps.every((r) => r.included)) return metrics;

  const family = FAMILIES[evaluation.family];
  const bestKeys = new Set(
    family.metrics
      .filter((m) => m.estimator === 'best')
      .flatMap((m) => m.aliases),
  );
  const included = repetitions.filter((_, i) => evaluation.reps[i]?.included);
  const out: Record<string, unknown> = { ...metrics };

  for (const key of Object.keys(metrics)) {
    const values = included
      .map((rep) => (rep.metrics as Record<string, unknown> | undefined)?.[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (!values.length) continue;
    out[key] = +(
      bestKeys.has(key) ? Math.max(...values) : mean(values)
    ).toFixed(6);
    if (`${key}_values` in metrics) out[`${key}_values`] = values;
  }
  return out;
}
