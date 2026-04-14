import { Injectable } from '@nestjs/common';
import type {
  AnalysisSection,
  CategoryName,
  CategoryScores,
  DerivedVariables,
  OverallLevel,
  TriggeredRule,
} from './analysis.types';
import { WEIGHTED_CATEGORIES } from './analysis.types';

const CATEGORY_LABELS: Record<CategoryName, string> = {
  potencia: 'Potencia',
  reactividad: 'Reactividad',
  estrategia: 'Estrategia neuromuscular',
  resistencia: 'Resistencia neuromuscular',
  asimetria: 'Simetría bilateral',
  global: 'Global',
};

const LEVEL_LABELS: Record<OverallLevel, string> = {
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
};

@Injectable()
export class AnalysisGeneratorService {
  generate(
    derived: DerivedVariables,
    triggered: TriggeredRule[],
    scores: CategoryScores,
    totalScore: number,
    level: OverallLevel,
  ): AnalysisSection {
    const profile = this.buildProfile(derived, scores, totalScore, level);
    const strengths = this.buildStrengths(triggered, scores);
    const weaknesses = this.buildWeaknesses(triggered, scores);
    const mainLimiter = this.buildMainLimiter(triggered, scores);
    const recommendations = this.buildRecommendations(triggered);

    return { profile, strengths, weaknesses, mainLimiter, recommendations };
  }

  generateNarrativeText(section: AnalysisSection): string {
    const parts: string[] = [];

    parts.push(section.profile);

    if (section.strengths.length) {
      parts.push('**Fortalezas:** ' + section.strengths.join('. ') + '.');
    }

    if (section.weaknesses.length) {
      parts.push('**Debilidades:** ' + section.weaknesses.join('. ') + '.');
    }

    if (section.mainLimiter) {
      parts.push('**Principal limitante:** ' + section.mainLimiter);
    }

    if (section.recommendations.length) {
      parts.push(
        '**Recomendaciones:**\n' +
          section.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n'),
      );
    }

    return parts.join('\n\n');
  }

  private buildProfile(
    derived: DerivedVariables,
    scores: CategoryScores,
    totalScore: number,
    level: OverallLevel,
  ): string {
    const levelLabel = LEVEL_LABELS[level];
    const parts: string[] = [];

    parts.push(
      `El atleta presenta un perfil neuromuscular de nivel **${levelLabel}** (score global: ${totalScore}/5).`,
    );

    const highCats = WEIGHTED_CATEGORIES.filter(
      (c) => scores[c] != null && scores[c]! >= 4,
    );
    const lowCats = WEIGHTED_CATEGORIES.filter(
      (c) => scores[c] != null && scores[c]! <= 2,
    );

    if (highCats.length && lowCats.length) {
      parts.push(
        `Muestra buena capacidad en ${this.catList(highCats)}, pero presenta déficit en ${this.catList(lowCats)}.`,
      );
    } else if (highCats.length) {
      parts.push(
        `Destaca en ${this.catList(highCats)}.`,
      );
    } else if (lowCats.length) {
      parts.push(
        `Presenta déficit en ${this.catList(lowCats)}, lo que requiere atención prioritaria.`,
      );
    }

    if (derived.cmj_height != null) {
      parts.push(
        `Altura CMJ promedio: ${derived.cmj_height.toFixed(1)} cm.`,
      );
    }
    if (derived.dj_rsi != null) {
      parts.push(`RSI promedio en Drop Jump: ${derived.dj_rsi.toFixed(2)}.`);
    }
    if (derived.fatigue_index != null) {
      parts.push(
        `Índice de fatiga: ${derived.fatigue_index.toFixed(1)}%.`,
      );
    }
    if (derived.asymmetry != null) {
      parts.push(
        `Asimetría bilateral: ${derived.asymmetry.toFixed(1)}%.`,
      );
    }

    return parts.join(' ');
  }

  private buildStrengths(
    triggered: TriggeredRule[],
    scores: CategoryScores,
  ): string[] {
    const items: string[] = [];

    for (const cat of WEIGHTED_CATEGORIES) {
      const s = scores[cat];
      if (s != null && s >= 4) {
        items.push(`${CATEGORY_LABELS[cat]} (${s.toFixed(1)}/5)`);
      }
    }

    for (const { rule } of triggered) {
      if (rule.severity === 'baja') {
        items.push(rule.message);
      }
    }

    return [...new Set(items)];
  }

  private buildWeaknesses(
    triggered: TriggeredRule[],
    scores: CategoryScores,
  ): string[] {
    const items: string[] = [];

    for (const cat of WEIGHTED_CATEGORIES) {
      const s = scores[cat];
      if (s != null && s <= 2) {
        items.push(`${CATEGORY_LABELS[cat]} (${s.toFixed(1)}/5)`);
      }
    }

    for (const { rule } of triggered) {
      if (rule.severity === 'alta') {
        items.push(rule.message);
      }
    }

    return [...new Set(items)];
  }

  private buildMainLimiter(
    triggered: TriggeredRule[],
    scores: CategoryScores,
  ): string | null {
    const globalDeficit = triggered.find(
      (t) => t.rule.id === 'perfil_deficit_global',
    );
    if (globalDeficit) {
      return `${globalDeficit.rule.message}. ${globalDeficit.rule.recommendation}.`;
    }

    let lowestCat: CategoryName | null = null;
    let lowestScore = Infinity;
    for (const cat of WEIGHTED_CATEGORIES) {
      const s = scores[cat];
      if (s != null && s < lowestScore) {
        lowestScore = s;
        lowestCat = cat;
      }
    }

    if (lowestCat && lowestScore <= 2.5) {
      return `${CATEGORY_LABELS[lowestCat]} es la capacidad más limitante (${lowestScore.toFixed(1)}/5). Se recomienda priorizarla en la planificación.`;
    }

    return null;
  }

  private buildRecommendations(triggered: TriggeredRule[]): string[] {
    const seen = new Set<string>();
    const recs: string[] = [];

    const sorted = [...triggered].sort(
      (a, b) => a.rule.score_impact - b.rule.score_impact,
    );

    for (const { rule } of sorted) {
      if (rule.severity === 'baja') continue;
      if (seen.has(rule.recommendation)) continue;
      seen.add(rule.recommendation);
      recs.push(rule.recommendation);
    }

    return recs;
  }

  private catList(cats: CategoryName[]): string {
    return cats.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(', ');
  }
}
