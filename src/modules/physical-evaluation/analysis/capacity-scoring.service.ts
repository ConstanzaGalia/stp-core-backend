import { Injectable } from '@nestjs/common';
import type {
  CategoryName,
  CategoryScores,
  OverallLevel,
  RulesConfigFile,
  ScoringResult,
  TriggeredRule,
} from './analysis.types';
import { WEIGHTED_CATEGORIES } from './analysis.types';

const BASE_SCORE = 3;
const MIN_SCORE = 1;
const MAX_SCORE = 5;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

@Injectable()
export class CapacityScoringService {
  score(
    triggered: TriggeredRule[],
    config: RulesConfigFile | null,
  ): ScoringResult {
    const weights: Record<string, number> = config?.scoring?.weights ?? {
      potencia: 0.25,
      reactividad: 0.25,
      estrategia: 0.2,
      resistencia: 0.15,
      asimetria: 0.15,
    };

    const levels = config?.levels ?? {
      low: { min: 0, max: 2 },
      medium: { min: 2, max: 3.5 },
      high: { min: 3.5, max: 5 },
    };

    const impactByCategory = new Map<CategoryName, number>();
    let globalImpact = 0;

    for (const { rule } of triggered) {
      const cat = rule.category as CategoryName;
      if (cat === 'global') {
        globalImpact += rule.score_impact;
      } else {
        const prev = impactByCategory.get(cat) ?? 0;
        impactByCategory.set(cat, prev + rule.score_impact);
      }
    }

    const perCategoryGlobalBonus =
      WEIGHTED_CATEGORIES.length > 0
        ? globalImpact / WEIGHTED_CATEGORIES.length
        : 0;

    const categoryScores: CategoryScores = {
      potencia: null,
      reactividad: null,
      estrategia: null,
      resistencia: null,
      asimetria: null,
      global: null,
    };

    for (const cat of WEIGHTED_CATEGORIES) {
      const catImpact = impactByCategory.get(cat) ?? 0;
      const raw = BASE_SCORE + catImpact + perCategoryGlobalBonus;
      categoryScores[cat] = +clamp(raw, MIN_SCORE, MAX_SCORE).toFixed(2);
    }

    if (globalImpact !== 0) {
      const rawGlobal = BASE_SCORE + globalImpact;
      categoryScores.global = +clamp(rawGlobal, MIN_SCORE, MAX_SCORE).toFixed(2);
    }

    let weightedSum = 0;
    let weightSum = 0;
    for (const cat of WEIGHTED_CATEGORIES) {
      const s = categoryScores[cat];
      if (s == null) continue;
      const w = weights[cat] ?? 0;
      weightedSum += s * w;
      weightSum += w;
    }

    const totalScore = weightSum > 0 ? +(weightedSum / weightSum).toFixed(2) : BASE_SCORE;

    let level: OverallLevel = 'medium';
    if (totalScore < (levels.low?.max ?? 2)) level = 'low';
    else if (totalScore >= (levels.high?.min ?? 3.5)) level = 'high';

    return { categoryScores, totalScore, level };
  }
}
