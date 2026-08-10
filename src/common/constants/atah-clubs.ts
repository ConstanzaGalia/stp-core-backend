/**
 * Catálogo de clubes ATAH (código ↔ etiqueta canónica).
 * El match contra user.club_name es case-insensitive + trim.
 */

export type AtahClubCode =
  | 'club_atletico_tucuman'
  | 'club_san_martin'
  | 'los_tarcos_rugby'
  | 'monteros_voley';

export type ClubAnalyticsSexScope = 'damas' | 'caballeros' | 'ambos';

export const ATAH_CLUBS: ReadonlyArray<{ code: AtahClubCode; label: string }> = [
  { code: 'club_atletico_tucuman', label: 'Club Atlético Tucumán' },
  { code: 'club_san_martin', label: 'Club San Martín' },
  { code: 'los_tarcos_rugby', label: 'Los Tarcos Rugby Club' },
  { code: 'monteros_voley', label: 'Monteros Voley Club' },
];

const LABEL_BY_CODE = new Map(ATAH_CLUBS.map((c) => [c.code, c.label]));

/** Variantes habituales en carga manual (ej. "Tarcos" → Los Tarcos Rugby Club). */
export const ATAH_CLUB_ALIASES: Readonly<Record<AtahClubCode, readonly string[]>> = {
  club_atletico_tucuman: ['cat', 'atletico tucuman', 'club atletico', 'atletico'],
  club_san_martin: ['san martin', 'csm', 'club sm'],
  los_tarcos_rugby: ['tarcos', 'los tarcos', 'tarcos rugby', 'los tarcos rugby'],
  monteros_voley: ['monteros', 'monteros voley', 'mvc'],
};

const CODE_BY_NORMALIZED_KEY = new Map<string, AtahClubCode>();
for (const club of ATAH_CLUBS) {
  CODE_BY_NORMALIZED_KEY.set(normalizeClubKey(club.label), club.code);
}
for (const club of ATAH_CLUBS) {
  for (const alias of ATAH_CLUB_ALIASES[club.code] ?? []) {
    CODE_BY_NORMALIZED_KEY.set(normalizeClubKey(alias), club.code);
  }
}

export function normalizeClubKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isAtahClubCode(value: string): value is AtahClubCode {
  return LABEL_BY_CODE.has(value as AtahClubCode);
}

export function getAtahClubLabel(code: AtahClubCode | string): string | null {
  return LABEL_BY_CODE.get(code as AtahClubCode) ?? null;
}

export function resolveAtahClubCodeFromName(
  clubName: string | null | undefined,
): AtahClubCode | null {
  if (!clubName?.trim()) return null;
  return CODE_BY_NORMALIZED_KEY.get(normalizeClubKey(clubName)) ?? null;
}

/** Match jugador ↔ club del entrenador analytics (label canónico o alias). */
export function athleteMatchesClubCode(
  athleteClubName: string | null | undefined,
  clubCode: AtahClubCode | string,
  centerName?: string | null,
): boolean {
  if (!isAtahClubCode(clubCode)) return false;
  const resolvedName = athleteClubName?.trim() || centerName?.trim() || '';
  if (!resolvedName) return false;
  return resolveAtahClubCodeFromName(resolvedName) === clubCode;
}

export function sexScopeMatchesAthlete(
  sexScope: ClubAnalyticsSexScope | string,
  athleteSexo: string | null | undefined,
): boolean {
  if (sexScope === 'ambos') return true;
  const s = (athleteSexo ?? '').trim().toLowerCase();
  if (sexScope === 'damas') return s === 'femenino';
  if (sexScope === 'caballeros') return s === 'masculino';
  return false;
}

export function sexScopeLabel(sexScope: ClubAnalyticsSexScope | string): string {
  if (sexScope === 'damas') return 'Damas';
  if (sexScope === 'caballeros') return 'Caballeros';
  return 'Damas y caballeros';
}
