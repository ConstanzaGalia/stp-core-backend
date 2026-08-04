export type MatchConfidence = 'exact' | 'probable' | 'ambiguous' | 'none';

export interface RosterAthleteCandidate {
  athleteId: string;
  name: string;
  lastName: string;
  email?: string | null;
  divisionId?: string | null;
}

export interface AthleteMatchResult {
  confidence: MatchConfidence;
  athleteId: string | null;
  candidates: Array<{
    athleteId: string;
    name: string;
    lastName: string;
    email?: string | null;
    score: number;
  }>;
}

/** Quita acentos, baja a minúsculas y colapsa espacios/puntuación. */
export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function personNameTokens(value: string | null | undefined): string[] {
  return normalizePersonName(value).split(' ').filter(Boolean);
}

export function fullNameVariants(name: string, lastName: string): string[] {
  const n = normalizePersonName(name);
  const l = normalizePersonName(lastName);
  const variants = new Set<string>();
  if (n && l) {
    variants.add(`${l} ${n}`);
    variants.add(`${n} ${l}`);
  }
  if (l) variants.add(l);
  if (n) variants.add(n);
  const combined = normalizePersonName(`${lastName} ${name}`);
  if (combined) variants.add(combined);
  return [...variants];
}

function tokenSetScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const token of a) {
    if (setB.has(token)) overlap += 1;
  }
  const union = new Set([...a, ...b]).size;
  if (!union) return 0;
  const jaccard = overlap / union;
  const coverage = overlap / Math.max(a.length, b.length);
  const shorter = a.length <= b.length ? setA : setB;
  const longer = a.length <= b.length ? setB : setA;
  let contained = true;
  for (const token of shorter) {
    if (!longer.has(token)) {
      contained = false;
      break;
    }
  }
  // Si el nombre más corto está contenido en el más largo (segundo nombre, etc.)
  const containmentBoost = contained && shorter.size >= 2 ? 0.95 : 0;
  return Math.round(Math.max(jaccard * 0.55 + coverage * 0.45, containmentBoost) * 1000) / 1000;
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
 * Empareja un hint de nombre (archivo o fila) contra el roster autorizado.
 * Prioriza coincidencia exacta de variantes apellido+nombre / nombre+apellido.
 */
export function matchAthleteByName(
  sourceHint: string | null | undefined,
  roster: RosterAthleteCandidate[],
): AthleteMatchResult {
  const hint = normalizePersonName(sourceHint);
  if (!hint || !roster.length) {
    return { confidence: 'none', athleteId: null, candidates: [] };
  }

  const hintTokens = personNameTokens(hint);
  const scored = roster
    .map((athlete) => {
      const variants = fullNameVariants(athlete.name, athlete.lastName);
      let best = 0;
      for (const variant of variants) {
        if (variant === hint) {
          best = 1;
          break;
        }
        const variantTokens = personNameTokens(variant);
        const setScore = tokenSetScore(hintTokens, variantTokens);
        const distance = levenshtein(hint, variant);
        const maxLen = Math.max(hint.length, variant.length, 1);
        const fuzzy = 1 - distance / maxLen;
        const score = Math.max(setScore, fuzzy >= 0.88 ? fuzzy : 0);
        if (score > best) best = score;
      }
      return {
        athleteId: athlete.athleteId,
        name: athlete.name,
        lastName: athlete.lastName,
        email: athlete.email ?? null,
        score: Math.round(best * 1000) / 1000,
      };
    })
    .filter((row) => row.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { confidence: 'none', athleteId: null, candidates: [] };
  }

  const top = scored[0];
  const close = scored.filter((row) => row.score >= top.score - 0.05);

  if (top.score >= 0.98 && close.length === 1) {
    return { confidence: 'exact', athleteId: top.athleteId, candidates: scored.slice(0, 5) };
  }
  if (top.score >= 0.82 && close.length === 1) {
    return { confidence: 'probable', athleteId: top.athleteId, candidates: scored.slice(0, 5) };
  }
  if (close.length > 1) {
    return { confidence: 'ambiguous', athleteId: null, candidates: scored.slice(0, 8) };
  }
  return { confidence: 'none', athleteId: null, candidates: scored.slice(0, 5) };
}

const FILENAME_NOISE = new Set([
  'cmj',
  'sj',
  'dj',
  'drop',
  'jump',
  'squat',
  'mccall',
  'imtp',
  'bilateral',
  'unilateral',
  'izquierda',
  'derecha',
  'left',
  'right',
  'test',
  'eval',
  'evaluacion',
  'ivolution',
  'force',
  'platform',
  'pdf',
  'csv',
  'xlsx',
  'xls',
]);

/** Extrae un hint de nombre desde el nombre de archivo (sin extensión ni tokens de test). */
export function extractAthleteHintFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = filename.replace(/\.[^.]+$/, '');
  const cleaned = base
    .replace(/[_\-]+/g, ' ')
    .replace(/\d{1,4}([./-]\d{1,2}){1,2}/g, ' ')
    .replace(/\d+/g, ' ');
  const tokens = personNameTokens(cleaned).filter((token) => !FILENAME_NOISE.has(token) && token.length > 1);
  if (!tokens.length) return null;
  return tokens.join(' ');
}
