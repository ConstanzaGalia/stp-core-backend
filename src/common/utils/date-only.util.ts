/**
 * Parsea YYYY-MM-DD (o ISO con tiempo) a Date a medianoche en zona local del proceso.
 * Evita el desfase de `new Date("YYYY-MM-DD")` (UTC) al filtrar turnos por día.
 */
export function parseDateOnlyLocal(
  value?: string | null,
): Date | undefined {
  if (value == null || !String(value).trim()) {
    return undefined;
  }
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}

/** Medianoche local del día indicado. */
export function startOfDateOnlyLocal(value?: string | null): Date | undefined {
  const date = parseDateOnlyLocal(value);
  if (!date) return undefined;
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Fin del día local (23:59:59.999). */
export function endOfDateOnlyLocal(value?: string | null): Date | undefined {
  const date = parseDateOnlyLocal(value);
  if (!date) return undefined;
  date.setHours(23, 59, 59, 999);
  return date;
}
