/** Utilidades de fechas y grilla para staff scheduling. */

/** Normaliza a YYYY-MM-DD (lectura desde columnas `date` de PostgreSQL vía TypeORM). */
export function toCalendarDateString(date: Date | string): string {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date).trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const y = date.getUTCFullYear();
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const parsed = new Date(String(date));
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const mo = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return String(date).slice(0, 10);
}

/** Fecha calendario desde YYYY-MM-DD (zona local, sin desfase al persistir en columnas `date`). */
export function parseCalendarDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseCalendarDate(dateStr);
  d.setDate(d.getDate() + days);
  return toCalendarDateString(d);
}

/** Lunes de la semana que contiene dateStr (ISO). */
export function getWeekStartMonday(dateStr: string): string {
  const d = parseCalendarDate(dateStr);
  const dow = d.getDay(); // 0=dom … 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toCalendarDateString(d);
}

export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function formatDayLabel(dateStr: string): string {
  const d = parseCalendarDate(dateStr);
  const dow = d.getDay();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${DAY_NAMES[dow]} ${day}/${month}`;
}

/** Ej: Matías + Guerrero → Matías G. */
export function formatStaffDisplayNameFromParts(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';
  if (!first) return 'Sin nombre';
  if (!last) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function formatSlotLabel(startTime: string, endTime: string): string {
  const sh = parseInt(startTime.split(':')[0], 10);
  const eh = parseInt(endTime.split(':')[0], 10);
  return `${sh} a ${eh}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SlotRow {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  label: string;
}

export function generateSlotsForConfig(
  startTime: string,
  endTime: string,
  slotDurationMinutes: number,
): SlotRow[] {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const slots: SlotRow[] = [];
  let current = startMin;
  while (current + slotDurationMinutes <= endMin) {
    const st = minutesToTime(current);
    const et = minutesToTime(current + slotDurationMinutes);
    slots.push({
      startTime: st,
      endTime: et,
      durationMinutes: slotDurationMinutes,
      label: formatSlotLabel(st, et),
    });
    current += slotDurationMinutes;
  }
  return slots;
}

/**
 * Grilla de cobertura del staff: incluye un turno extra después del cierre
 * configurado (ej. config hasta 20:00 → fila 20 a 21 para cierre del centro).
 */
export function generateStaffGridSlots(
  startTime: string,
  endTime: string,
  slotDurationMinutes: number,
): SlotRow[] {
  const extendedEndMin = timeToMinutes(endTime) + slotDurationMinutes;
  return generateSlotsForConfig(
    startTime,
    minutesToTime(extendedEndMin),
    slotDurationMinutes,
  );
}

export function cellKey(date: string, startTime: string): string {
  return `${date}|${startTime}`;
}

export const DEFAULT_STAFF_COLORS = [
  '#2563eb',
  '#ea580c',
  '#dc2626',
  '#92400e',
  '#7c3aed',
  '#0891b2',
  '#059669',
  '#db2777',
];
