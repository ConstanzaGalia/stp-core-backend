/**
 * Catálogo de clubes ATAH (código ↔ etiqueta canónica).
 * El match contra user.club_name es case-insensitive + trim.
 * Códigos dinámicos (desde club_name de jugadores) se generan con slugifyClubCode.
 */

export type AtahClubCode =
  | 'club_atletico_tucuman'
  | 'club_san_martin'
  | 'los_tarcos_rugby'
  | 'monteros_voley';

export type ClubAnalyticsSexScope = 'damas' | 'caballeros' | 'ambos';

export type AtahClubOptionSource = 'catalog' | 'athletes';

export type AtahClubOption = {
  code: string;
  label: string;
  source: AtahClubOptionSource;
  athleteCount?: number;
};

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

/** "Huirapuca" → "huirapuca"; "Los Tarcos Rugby Club" → "los_tarcos_rugby_club" */
export function slugifyClubCode(label: string): string {
  const slug = normalizeClubKey(label)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return slug || 'club';
}

export function isCatalogAtahClubCode(value: string): value is AtahClubCode {
  return LABEL_BY_CODE.has(value as AtahClubCode);
}

/** @deprecated Prefer isCatalogAtahClubCode + opciones mergeadas */
export function isAtahClubCode(value: string): value is AtahClubCode {
  return isCatalogAtahClubCode(value);
}

export function getAtahClubLabel(
  code: AtahClubCode | string,
  options?: ReadonlyArray<{ code: string; label: string }>,
): string | null {
  const fromCatalog = LABEL_BY_CODE.get(code as AtahClubCode);
  if (fromCatalog) return fromCatalog;
  if (options?.length) {
    return options.find((o) => o.code === code)?.label ?? null;
  }
  return null;
}

export function resolveAtahClubCodeFromName(
  clubName: string | null | undefined,
): AtahClubCode | null {
  if (!clubName?.trim()) return null;
  return CODE_BY_NORMALIZED_KEY.get(normalizeClubKey(clubName)) ?? null;
}

/**
 * Merge catálogo fijo + nombres distintos de jugadores.
 * Si un club_name ya mapea al catálogo (label/alias), no se duplica.
 */
export function buildAtahClubOptions(
  athleteClubNames: ReadonlyArray<{ name: string; count?: number }>,
): AtahClubOption[] {
  const byCode = new Map<string, AtahClubOption>();

  for (const club of ATAH_CLUBS) {
    byCode.set(club.code, {
      code: club.code,
      label: club.label,
      source: 'catalog',
    });
  }

  for (const row of athleteClubNames) {
    const name = row.name?.trim();
    if (!name) continue;
    const catalogCode = resolveAtahClubCodeFromName(name);
    if (catalogCode) {
      const existing = byCode.get(catalogCode);
      if (existing && row.count != null) {
        existing.athleteCount = (existing.athleteCount ?? 0) + row.count;
      }
      continue;
    }
    const code = slugifyClubCode(name);
    const existing = byCode.get(code);
    if (existing) {
      if (row.count != null) {
        existing.athleteCount = (existing.athleteCount ?? 0) + row.count;
      }
      continue;
    }
    byCode.set(code, {
      code,
      label: name,
      source: 'athletes',
      athleteCount: row.count,
    });
  }

  return [...byCode.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }),
  );
}

export function isValidAtahClubOptionCode(
  code: string,
  options: ReadonlyArray<{ code: string }>,
): boolean {
  if (!code?.trim()) return false;
  if (isCatalogAtahClubCode(code)) return true;
  return options.some((o) => o.code === code);
}

/** Match jugador ↔ club del entrenador analytics (catálogo, alias o slug dinámico). */
export function athleteMatchesClubCode(
  athleteClubName: string | null | undefined,
  clubCode: AtahClubCode | string,
  centerName?: string | null,
): boolean {
  if (!clubCode?.trim()) return false;
  const resolvedName = athleteClubName?.trim() || centerName?.trim() || '';
  if (!resolvedName) return false;

  const catalogResolved = resolveAtahClubCodeFromName(resolvedName);
  if (catalogResolved && catalogResolved === clubCode) return true;
  if (isCatalogAtahClubCode(clubCode)) {
    return catalogResolved === clubCode;
  }
  return slugifyClubCode(resolvedName) === clubCode;
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
