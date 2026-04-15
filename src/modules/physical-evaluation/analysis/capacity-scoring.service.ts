import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CategoryName,
  CategoryScores,
  DerivedVariables,
  NormativeThresholds,
  NormativesConfigFile,
  OverallLevel,
  RulesConfigFile,
  ScoringResult,
} from './analysis.types';
import { RADAR_CATEGORY_NAMES } from './analysis.types';

const DEFAULT_NORMATIVES: NormativeThresholds = {
  cmj_height_cm: [20, 27, 33, 40],
  propulsive_force_n: [1200, 1700, 2200, 2800],
  propulsive_power: [1500, 2500, 3500, 4500],
  rsi: [0.8, 1.1, 1.4, 1.8],
  contact_time_s: [0.35, 0.28, 0.22, 0.18],
  braking_force_n: [800, 1200, 1700, 2200],
  braking_time_s: [0.45, 0.35, 0.28, 0.22],
  fatigue_index: [25, 18, 12, 8],
  asymmetry_pct: [20, 15, 10, 6],
  elasticity_pct: [8, 12, 18, 25],
  force_bw_ratio: [15, 20, 25, 30],
};

function round(value: number, digits = 2): number {
  return +value.toFixed(digits);
}

function scoreHigherIsBetter(
  value: number | null,
  thresholds: [number, number, number, number],
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < thresholds[0]) return 1;
  if (value < thresholds[1]) return 2;
  if (value < thresholds[2]) return 3;
  if (value < thresholds[3]) return 4;
  return 5;
}

function scoreLowerIsBetter(
  value: number | null,
  thresholds: [number, number, number, number],
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value > thresholds[0]) return 1;
  if (value > thresholds[1]) return 2;
  if (value > thresholds[2]) return 3;
  if (value > thresholds[3]) return 4;
  return 5;
}

function weightedAverage(parts: Array<{ score: number | null; weight: number }>): number | null {
  let weighted = 0;
  let totalWeight = 0;

  for (const part of parts) {
    if (part.score == null) continue;
    weighted += part.score * part.weight;
    totalWeight += part.weight;
  }

  if (totalWeight <= 0) return null;
  return weighted / totalWeight;
}

@Injectable()
export class CapacityScoringService {
  private readonly logger = new Logger(CapacityScoringService.name);
  private normatives: NormativeThresholds = DEFAULT_NORMATIVES;

  constructor() {
    this.loadNormatives();
  }

  private resolveNormativesPath(): string {
    const candidates = [
      path.join(__dirname, 'rules', 'normatives-v1.json'),
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'physical-evaluation',
        'analysis',
        'rules',
        'normatives-v1.json',
      ),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  private loadNormatives(): void {
    try {
      const filePath = this.resolveNormativesPath();
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as NormativesConfigFile;
      if (parsed.thresholds) {
        this.normatives = parsed.thresholds;
        this.logger.log(`Normativas cargadas (${parsed.version})`);
      }
    } catch (err) {
      this.logger.warn('Usando normativas por defecto (archivo no leído)', (err as Error).message);
      this.normatives = DEFAULT_NORMATIVES;
    }
  }

  getNormatives(): NormativeThresholds {
    return this.normatives;
  }

  score(derived: DerivedVariables, rulesConfig: RulesConfigFile | null): ScoringResult {
    const thr = this.normatives;

    const potencia = weightedAverage([
      { score: scoreHigherIsBetter(derived.cmj_height, thr.cmj_height_cm), weight: 0.5 },
      {
        score: scoreHigherIsBetter(derived.cmj_propulsive_force, thr.propulsive_force_n),
        weight: 0.25,
      },
      {
        score: scoreHigherIsBetter(derived.cmj_propulsive_power, thr.propulsive_power),
        weight: 0.25,
      },
    ]);

    const reactividad = weightedAverage([
      { score: scoreHigherIsBetter(derived.reactive_rsi, thr.rsi), weight: 0.7 },
      {
        score: scoreLowerIsBetter(derived.reactive_contact_time, thr.contact_time_s),
        weight: 0.3,
      },
    ]);

    const fuerzaParts: Array<{ score: number | null; weight: number }> = [
      {
        score: scoreHigherIsBetter(derived.cmj_braking_force, thr.braking_force_n),
        weight: 0.35,
      },
      {
        score: scoreLowerIsBetter(derived.cmj_braking_time, thr.braking_time_s),
        weight: 0.15,
      },
      {
        score: scoreHigherIsBetter(derived.cmj_propulsive_force, thr.propulsive_force_n),
        weight: 0.25,
      },
    ];
    if (derived.force_to_body_weight_ratio != null) {
      fuerzaParts.push({
        score: scoreHigherIsBetter(derived.force_to_body_weight_ratio, thr.force_bw_ratio),
        weight: 0.25,
      });
    } else {
      fuerzaParts[0].weight += 0.08;
      fuerzaParts[1].weight += 0.05;
      fuerzaParts[2].weight += 0.12;
    }
    const fuerza = weightedAverage(fuerzaParts);

    const estrategiaParts: Array<{ score: number | null; weight: number }> = [];
    if (derived.elasticity_index != null) {
      estrategiaParts.push({
        score: scoreHigherIsBetter(derived.elasticity_index, thr.elasticity_pct),
        weight: 0.55,
      });
    }
    estrategiaParts.push({
      score: scoreHigherIsBetter(derived.reactive_rsi, thr.rsi),
      weight: derived.elasticity_index != null ? 0.25 : 0.5,
    });
    estrategiaParts.push({
      score: scoreHigherIsBetter(derived.cmj_height, thr.cmj_height_cm),
      weight: derived.elasticity_index != null ? 0.2 : 0.5,
    });
    const estrategia = weightedAverage(estrategiaParts);

    const resistencia = scoreLowerIsBetter(derived.fatigue_index, thr.fatigue_index);
    const asimetria = scoreLowerIsBetter(derived.asymmetry, thr.asymmetry_pct);

    const categoryScores: CategoryScores = {
      potencia: potencia == null ? null : round(potencia),
      reactividad: reactividad == null ? null : round(reactividad),
      fuerza: fuerza == null ? null : round(fuerza),
      estrategia: estrategia == null ? null : round(estrategia),
      resistencia: resistencia == null ? null : round(resistencia),
      asimetria: asimetria == null ? null : round(asimetria),
      global: null,
    };

    const weights = rulesConfig?.scoring?.weights;
    let global: number | null = null;
    if (weights && Object.keys(weights).length) {
      let sum = 0;
      let tw = 0;
      for (const [key, w] of Object.entries(weights)) {
        const cat = key as CategoryName;
        const s = categoryScores[cat];
        if (s != null && typeof w === 'number' && w > 0) {
          sum += s * w;
          tw += w;
        }
      }
      if (tw > 0) global = round(sum / tw);
    }

    if (global == null) {
      const available = RADAR_CATEGORY_NAMES.map((category) => categoryScores[category]).filter(
        (score): score is number => score != null,
      );
      global =
        available.length > 0
          ? round(available.reduce((acc, value) => acc + value, 0) / available.length)
          : null;
    }

    categoryScores.global = global;

    // Sin categorías puntuables, totalScore 0 en API; distinto del fallback 3 del radar en el frontend.
    const totalScore = global ?? 0;

    const levels = rulesConfig?.levels;
    let level: OverallLevel = 'medium';
    if (levels?.low && global != null) {
      if (global < levels.low.max) level = 'low';
      else if (levels.high && global >= levels.high.min) level = 'high';
    } else {
      if (global == null || global < 2.2) level = 'low';
      else if (global >= 3.6) level = 'high';
    }

    return { categoryScores, totalScore, level };
  }
}
