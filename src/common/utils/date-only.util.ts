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

/** Argentina civil time is UTC-3 year-round (no DST since 2009). */
export const ARGENTINA_ISO_OFFSET = '-03:00';
export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Calendar date YYYY-MM-DD for a DATE/timestamp stored at midnight UTC. */
export function toDateOnlyKey(
  value?: string | Date | null,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  return undefined;
}

export function normalizeClockTime(time?: string | null): string {
  if (!time) return '00:00';
  const parts = time.split(':');
  const hours = (parts[0] ?? '00').padStart(2, '0');
  const minutes = (parts[1] ?? '00').padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Instant of a gym slot: calendar date + startTime in America/Argentina/Buenos_Aires.
 * `startTime` is wall-clock in Argentina, not the server timezone.
 */
export function slotInstantInArgentina(
  date?: string | Date | null,
  startTime?: string | null,
): Date | undefined {
  const dateKey = toDateOnlyKey(date);
  if (!dateKey) return undefined;
  const time = normalizeClockTime(startTime);
  const instant = new Date(`${dateKey}T${time}:00${ARGENTINA_ISO_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

export function isAtLeastHoursBeforeSlot(
  date: string | Date | null | undefined,
  startTime: string | null | undefined,
  hours: number,
  now: Date = new Date(),
): boolean {
  const slot = slotInstantInArgentina(date, startTime);
  if (!slot) return false;
  return now.getTime() < slot.getTime() - hours * 60 * 60 * 1000;
}

export function isSlotInThePast(
  date: string | Date | null | undefined,
  startTime: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const slot = slotInstantInArgentina(date, startTime);
  if (!slot) return true;
  return slot.getTime() <= now.getTime();
}

/** Civil calendar date in Argentina: YYYY-MM-DD. */
export function calendarDateInArgentina(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/** Month-day in Argentina: MM-DD (for birthdays). */
export function monthDayInArgentina(now: Date = new Date()): string {
  return calendarDateInArgentina(now).slice(5);
}

/** Month-day of a stored DATE (YYYY-MM-DD), independent of "now". */
export function monthDayFromDateOnly(
  value?: string | Date | null,
): string | undefined {
  const key = toDateOnlyKey(value);
  return key ? key.slice(5) : undefined;
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
