/** Matching fuzzy de nombres de ejercicio (CSV → catálogo del centro). */

export type ExerciseMatchStatus = 'exact' | 'suggested' | 'missing';

export interface ExerciseCatalogItem {
  id: string;
  name: string;
}

export interface ExerciseNameCandidate {
  exerciseId: string;
  name: string;
  score: number;
}

export interface ExerciseNameMatchResult {
  csvName: string;
  status: ExerciseMatchStatus;
  exerciseId: string | null;
  candidates: ExerciseNameCandidate[];
}

export function normalizeExerciseName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeExerciseName(value).split(' ').filter(Boolean);
}

function tokenSetScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let overlap = 0;
  for (const token of a) {
    if (setB.has(token)) overlap += 1;
  }
  const union = new Set([...a, ...b]).size;
  if (!union) return 0;
  const jaccard = overlap / union;
  const coverage = overlap / Math.max(a.length, b.length);
  return Math.round((jaccard * 0.55 + coverage * 0.45) * 1000) / 1000;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }
  return prev[b.length];
}

/**
 * Empareja un nombre CSV contra el catálogo del centro.
 * exact ≥ 0.98; suggested ≥ 0.72 con candidatos; missing si no hay match útil.
 */
export function matchExerciseName(
  csvName: string,
  catalog: ExerciseCatalogItem[],
  maxCandidates = 3,
): ExerciseNameMatchResult {
  const hint = normalizeExerciseName(csvName);
  if (!hint || !catalog.length) {
    return { csvName, status: 'missing', exerciseId: null, candidates: [] };
  }

  const hintTokens = tokens(hint);
  const scored = catalog
    .map((item) => {
      const norm = normalizeExerciseName(item.name);
      if (!norm) return null;
      if (norm === hint) {
        return { exerciseId: item.id, name: item.name, score: 1 };
      }
      const setScore = tokenSetScore(hintTokens, tokens(norm));
      const distance = levenshtein(hint, norm);
      const maxLen = Math.max(hint.length, norm.length, 1);
      const fuzzy = 1 - distance / maxLen;
      const score = Math.max(setScore, fuzzy >= 0.85 ? fuzzy : 0);
      return {
        exerciseId: item.id,
        name: item.name,
        score: Math.round(score * 1000) / 1000,
      };
    })
    .filter((row): row is ExerciseNameCandidate => !!row && row.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { csvName, status: 'missing', exerciseId: null, candidates: [] };
  }

  const top = scored[0];
  const candidates = scored.slice(0, maxCandidates);

  if (top.score >= 0.98) {
    return {
      csvName,
      status: 'exact',
      exerciseId: top.exerciseId,
      candidates,
    };
  }
  if (top.score >= 0.72) {
    return {
      csvName,
      status: 'suggested',
      exerciseId: top.exerciseId,
      candidates,
    };
  }
  return {
    csvName,
    status: 'missing',
    exerciseId: null,
    candidates,
  };
}
