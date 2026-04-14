import { Injectable } from '@nestjs/common';
import type { NormalizedTest, DerivedVariables } from './analysis.types';

const CMJ_TYPES = new Set(['cmj', 'countermovement_jump']);
const DJ_TYPES = new Set(['drop_jump', 'dropjump', 'dj']);

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

function gather(
  tests: NormalizedTest[],
  typeSet: Set<string>,
  ...aliases: string[]
): number[] {
  const values: number[] = [];
  for (const t of tests) {
    if (!typeSet.has(t.testType)) continue;
    for (const alias of aliases) {
      const arr = t.metrics[alias];
      if (arr?.length) values.push(...arr);
    }
  }
  return values;
}

@Injectable()
export class DerivedVariablesService {
  compute(normalized: NormalizedTest[]): DerivedVariables {
    const cmjHeights = gather(
      normalized,
      CMJ_TYPES,
      'jump_height_cm',
      'jumpHeightCm',
      'altura_salto_cm',
      'height_cm',
      'altura',
    );

    const cmjBraking = gather(
      normalized,
      CMJ_TYPES,
      'braking_time',
      'braking_time_s',
      'tiempo_frenado',
      'tiempo_frenado_s',
      'braking_rfd',
    );

    const cmjPropForce = gather(
      normalized,
      CMJ_TYPES,
      'propulsive_force',
      'propulsive_force_n',
      'fuerza_propulsiva',
      'fuerza_propulsiva_n',
      'peak_propulsive_force',
    );

    const djRsi = gather(
      normalized,
      DJ_TYPES,
      'rsi',
      'RSI',
      'reactive_strength_index',
    );

    const djContactRaw = gather(
      normalized,
      DJ_TYPES,
      'contact_time_ms',
      'contactTimeMs',
      'tiempo_contacto_ms',
      'contact_time_s',
      'tiempo_contacto_s',
      'contact_time',
    );

    const djContact = djContactRaw.map((v) => (v > 5 ? v / 1000 : v));

    const fatigueIndex = this.computeFatigueIndex(cmjHeights);

    const asymmetry = this.computeAsymmetry(normalized);

    return {
      cmj_height: avg(cmjHeights),
      cmj_braking_time: avg(cmjBraking),
      cmj_propulsive_force: avg(cmjPropForce),
      dj_rsi: avg(djRsi),
      dj_contact_time: avg(djContact),
      fatigue_index: fatigueIndex,
      asymmetry,
    };
  }

  private computeFatigueIndex(heights: number[]): number | null {
    if (heights.length < 2) return null;
    const hi = best(heights)!;
    const lo = worst(heights)!;
    if (hi === 0) return null;
    return +((((hi - lo) / hi) * 100).toFixed(1));
  }

  private computeAsymmetry(tests: NormalizedTest[]): number | null {
    const leftAliases = [
      'left_force',
      'fuerza_izquierda',
      'left_height',
      'left',
      'izquierda',
    ];
    const rightAliases = [
      'right_force',
      'fuerza_derecha',
      'right_height',
      'right',
      'derecha',
    ];

    const lefts: number[] = [];
    const rights: number[] = [];

    for (const t of tests) {
      for (const alias of leftAliases) {
        const arr = t.metrics[alias];
        if (arr?.length) lefts.push(...arr);
      }
      for (const alias of rightAliases) {
        const arr = t.metrics[alias];
        if (arr?.length) rights.push(...arr);
      }
    }

    const avgL = avg(lefts);
    const avgR = avg(rights);
    if (avgL == null || avgR == null) return null;
    const maxVal = Math.max(avgL, avgR);
    if (maxVal === 0) return null;
    return +((Math.abs(avgL - avgR) / maxVal) * 100).toFixed(1);
  }
}
