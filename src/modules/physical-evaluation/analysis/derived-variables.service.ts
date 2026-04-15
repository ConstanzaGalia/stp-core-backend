import { Injectable } from '@nestjs/common';
import type { NormalizedTest, DerivedVariables } from './analysis.types';

const CMJ_TYPES = new Set(['cmj', 'cmj_bilateral', 'countermovement_jump']);
const DJ_TYPES = new Set(['drop_jump', 'dropjump', 'dj']);
const SJ_TYPES = new Set(['squat_jump', 'sq_jump', 'squatjump', 'sj']);
const MCCALL_TYPES = new Set([
  'mccall',
  'mccall_left',
  'mccall_right',
  'mccall_izq',
  'mccall_der',
  'isometric_mid_thigh_pull',
  'imtp',
]);

const HEIGHT_ALIASES = [
  'jump_height',
  'jump_height_values',
  'jump_height_cm',
  'jumpHeightCm',
  'altura_salto_cm',
  'altura_de_salto',
  'height_cm',
  'altura',
];

const RSI_ALIASES = ['rsi', 'RSI', 'reactive_strength_index'];

const CONTACT_ALIASES = [
  'contact_time',
  'contact_time_values',
  'contact_time_ms',
  'contactTimeMs',
  'tiempo_de_contacto',
  'tiempo_contacto_ms',
  'contact_time_s',
  'tiempo_contacto_s',
];

const PESO_ALIASES = ['peso', 'body_weight', 'body_weight_kg', 'peso_corporal'];

const MCCALL_FORCE_ALIASES = [
  'max_propulsive_force',
  'max_propulsive_force_values',
  'fuerza_max_propulsiva',
  'fuerza_max_propulsiva_der',
  'fuerza_max_propulsiva_izq',
  'peak_force',
  'peak_force_n',
  'fuerza_maxima',
  'fuerza_pico',
];

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function best(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.max(...nums);
}

function worst(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.min(...nums);
}

function round(value: number | null, digits = 3): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return +value.toFixed(digits);
}

function gatherFromTests(
  tests: NormalizedTest[],
  aliases: string[],
  typeSet?: Set<string>,
): number[] {
  const values: number[] = [];
  for (const t of tests) {
    const tt = t.testType.trim().toLowerCase();
    if (typeSet && !typeSet.has(tt)) continue;
    for (const alias of aliases) {
      const arr = t.metrics[alias];
      if (arr?.length) values.push(...arr);
    }
  }
  return values;
}

function gatherWithFallback(
  tests: NormalizedTest[],
  typeSet: Set<string>,
  aliases: string[],
): number[] {
  const scoped = gatherFromTests(tests, aliases, typeSet);
  if (scoped.length) return scoped;
  return gatherFromTests(tests, aliases);
}

function mccallSide(testType: string): 'left' | 'right' | 'unknown' {
  const t = testType
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\bizq\b|izquierda|\bleft\b|mccall_left|mccall_izq|_izq|_l\b/.test(t)) return 'left';
  if (/\bder\b|derecha|\bright\b|mccall_right|mccall_der|_der|_r\b/.test(t)) return 'right';
  return 'unknown';
}

@Injectable()
export class DerivedVariablesService {
  compute(normalized: NormalizedTest[]): DerivedVariables {
    const cmjHeightRaw = gatherWithFallback(normalized, CMJ_TYPES, HEIGHT_ALIASES);
    const cmjHeights = cmjHeightRaw
      .map((value) => (value > 5 ? value : value * 100))
      .filter((value) => Number.isFinite(value));

    const sjHeightRaw = gatherFromTests(normalized, HEIGHT_ALIASES, SJ_TYPES);
    const sjHeights = sjHeightRaw
      .map((value) => (value > 5 ? value : value * 100))
      .filter((value) => Number.isFinite(value));

    const cmjBrakingTimeRaw = gatherWithFallback(normalized, CMJ_TYPES, [
      'braking_time',
      'braking_time_values',
      'braking_time_s',
      'tiempo_de_frenado',
      'tiempo_frenado',
      'tiempo_frenado_s',
      'tiempo_excéntrico',
      'tiempo_excentrico',
      'eccentric_time',
    ]);

    const cmjBrakingTime = cmjBrakingTimeRaw.map((value) => (value > 5 ? value / 1000 : value));

    const cmjBrakingForce = gatherWithFallback(normalized, CMJ_TYPES, [
      'max_braking_force',
      'max_braking_force_values',
      'fuerza_max_frenado',
      'fuerza_max_frenado_der',
      'fuerza_max_frenado_izq',
      'braking_force',
      'braking_force_n',
      'peak_braking_force',
    ]);

    const cmjPropForce = gatherWithFallback(normalized, CMJ_TYPES, [
      'max_propulsive_force',
      'max_propulsive_force_values',
      'fuerza_max_propulsiva',
      'fuerza_max_propulsiva_der',
      'fuerza_max_propulsiva_izq',
      'propulsive_force',
      'propulsive_force_n',
      'fuerza_propulsiva',
      'fuerza_propulsiva_n',
      'peak_propulsive_force',
    ]);

    const cmjPropPower = gatherWithFallback(normalized, CMJ_TYPES, [
      'max_propulsive_power',
      'max_propulsive_power_values',
      'potencia_maxima_propulsiva',
      'potencia_maxima_propusiva',
      'potencia_media_propulsiva',
      'potencia_media_propusiva',
      'propulsive_power',
      'peak_propulsive_power',
    ]);

    const djRsi = gatherFromTests(normalized, RSI_ALIASES, DJ_TYPES);
    const djContactRaw = gatherFromTests(normalized, CONTACT_ALIASES, DJ_TYPES);

    const cmjRsiVals = gatherFromTests(normalized, RSI_ALIASES, CMJ_TYPES);
    const cmjContactRaw = gatherFromTests(normalized, CONTACT_ALIASES, CMJ_TYPES);

    const djContact = djContactRaw.map((value) => (value > 5 ? value / 1000 : value));
    const cmjContact = cmjContactRaw.map((value) => (value > 5 ? value / 1000 : value));

    const djRsiAvg = avg(djRsi);
    const djContactAvg = avg(djContact);
    const cmjRsiAvg = avg(cmjRsiVals);
    const cmjContactAvg = avg(cmjContact);

    const reactiveRsi = djRsiAvg != null ? djRsiAvg : cmjRsiAvg;
    const reactiveContact = djContactAvg != null ? djContactAvg : cmjContactAvg;

    const pesoVals = gatherFromTests(normalized, PESO_ALIASES);
    const bodyWeightKg = (() => {
      const p = avg(pesoVals);
      if (p == null || !Number.isFinite(p)) return null;
      if (p >= 25 && p <= 220) return round(p, 2);
      return null;
    })();

    let mccallLeft: number | null = null;
    let mccallRight: number | null = null;
    const mccallPeaks: number[] = [];

    for (const t of normalized) {
      if (!MCCALL_TYPES.has(t.testType.trim().toLowerCase())) continue;
      const peaks: number[] = [];
      for (const alias of MCCALL_FORCE_ALIASES) {
        const arr = t.metrics[alias];
        if (arr?.length) peaks.push(...arr);
      }
      const peak = avg(peaks);
      if (peak == null) continue;
      mccallPeaks.push(peak);
      const side = mccallSide(t.testType);
      if (side === 'left') mccallLeft = peak;
      if (side === 'right') mccallRight = peak;
    }

    const mccallPeakForce = mccallPeaks.length ? avg(mccallPeaks) : null;

    let mccallAsym: number | null = null;
    if (mccallLeft != null && mccallRight != null && mccallLeft + mccallRight > 0) {
      const mx = Math.max(mccallLeft, mccallRight);
      if (mx > 0) mccallAsym = +((Math.abs(mccallLeft - mccallRight) / mx) * 100).toFixed(1);
    }

    const fatigueIndex = this.computeFatigueIndex(cmjHeights);
    const asymmetry = this.computeAsymmetry(normalized, mccallAsym);

    const cmjH = avg(cmjHeights);
    const sjH = avg(sjHeights);
    let elasticity: number | null = null;
    if (cmjH != null && sjH != null && sjH > 0) {
      elasticity = +(((cmjH - sjH) / sjH) * 100).toFixed(1);
    }

    let forceBw: number | null = null;
    if (bodyWeightKg != null && bodyWeightKg > 0 && mccallPeakForce != null) {
      forceBw = +(mccallPeakForce / bodyWeightKg).toFixed(2);
    }

    return {
      cmj_height: round(cmjH, 2),
      cmj_braking_time: round(avg(cmjBrakingTime), 3),
      cmj_braking_force: round(avg(cmjBrakingForce), 2),
      cmj_propulsive_force: round(avg(cmjPropForce), 2),
      cmj_propulsive_power: round(avg(cmjPropPower), 2),
      dj_rsi: round(djRsiAvg, 3),
      dj_contact_time: round(djContactAvg, 3),
      cmj_rsi: round(cmjRsiAvg, 3),
      cmj_contact_time: round(cmjContactAvg, 3),
      reactive_rsi: round(reactiveRsi, 3),
      reactive_contact_time: round(reactiveContact, 3),
      sj_height: round(sjH, 2),
      elasticity_index: elasticity,
      body_weight_kg: bodyWeightKg,
      mccall_peak_force: round(mccallPeakForce, 2),
      mccall_peak_force_left: mccallLeft != null ? round(mccallLeft, 2) : null,
      mccall_peak_force_right: mccallRight != null ? round(mccallRight, 2) : null,
      mccall_asymmetry_pct: mccallAsym,
      force_to_body_weight_ratio: forceBw,
      fatigue_index: fatigueIndex,
      asymmetry,
    };
  }

  private computeFatigueIndex(heights: number[]): number | null {
    if (heights.length < 2) return null;
    const hi = best(heights);
    const lo = worst(heights);
    if (hi == null || lo == null || hi === 0) return null;
    return +((((hi - lo) / hi) * 100).toFixed(1));
  }

  private computeAsymmetry(tests: NormalizedTest[], mccallAsym: number | null): number | null {
    const asymmetryAliases = [
      'asymmetry',
      'asymmetry_values',
      'propulsive_asymmetry',
      'propulsive_asymmetry_values',
      'braking_asymmetry',
      'braking_asymmetry_values',
      'landing_asymmetry',
      'landing_asymmetry_values',
      'asimetria_propulsiva',
      'asimetria_frenado',
      'asimetria_aterrizaje',
    ];

    const values = gatherFromTests(tests, asymmetryAliases).map((value) => Math.abs(value));

    const direct = avg(values);
    if (direct != null) {
      const merged = mccallAsym != null ? Math.max(direct, mccallAsym) : direct;
      return +merged.toFixed(1);
    }

    if (mccallAsym != null) return mccallAsym;

    const leftAliases = ['left_force', 'fuerza_izquierda', 'left_height', 'left', 'izquierda'];
    const rightAliases = ['right_force', 'fuerza_derecha', 'right_height', 'right', 'derecha'];

    const lefts = gatherFromTests(tests, leftAliases);
    const rights = gatherFromTests(tests, rightAliases);

    const avgL = avg(lefts);
    const avgR = avg(rights);
    if (avgL == null || avgR == null) return null;
    const maxVal = Math.max(avgL, avgR);
    if (maxVal === 0) return null;
    return +((Math.abs(avgL - avgR) / maxVal) * 100).toFixed(1);
  }
}
