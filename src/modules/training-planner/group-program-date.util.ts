const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnlyUtc(ymd: string): Date {
  if (!DATE_ONLY_RE.test(ymd)) {
    throw new Error(`Fecha inválida: ${ymd}`);
  }
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateOnlyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseDateOnlyUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnlyUtc(d);
}

/** Lunes=0 … Domingo=6 */
export function dayOfWeekMon0(ymd: string): number {
  const d = parseDateOnlyUtc(ymd);
  return (d.getUTCDay() + 6) % 7;
}

export function weekStartDateForProgram(
  programStartDate: string,
  weekIndex: number,
): string {
  return addDaysYmd(programStartDate, (weekIndex - 1) * 7);
}

/** Lunes de la semana civil de `ymd` (Lun=inicio). */
export function mondayOfWeekContaining(ymd: string): string {
  const dow = dayOfWeekMon0(ymd);
  return addDaysYmd(ymd, -dow);
}

/**
 * Ancla de inscripción: la mayor entre el inicio del programa y el lunes
 * de la semana en que se inscribe el alumno.
 */
export function resolveEnrollmentScheduleAnchor(
  programStartDate: string,
  enrollmentYmd: string,
): string {
  const programStart = programStartDate.slice(0, 10);
  const monday = mondayOfWeekContaining(enrollmentYmd.slice(0, 10));
  return monday > programStart ? monday : programStart;
}

export function scheduledDateForSlot(
  programStartDate: string,
  weekIndex: number,
  dayOfWeek: number,
): string {
  const weekStart = weekStartDateForProgram(programStartDate, weekIndex);
  const startDow = dayOfWeekMon0(weekStart);
  let delta = dayOfWeek - startDow;
  if (delta < 0) delta += 7;
  return addDaysYmd(weekStart, delta);
}

/**
 * Modelo B: Sesión k del microciclo cae en athleteTrainingDays[k-1]
 * dentro de la semana del programa. Retorna null si no hay día para ese ordinal.
 */
export function scheduledDateForAthleteSlot(
  programStartDate: string,
  weekIndex: number,
  sessionOrdinal: number,
  athleteTrainingDays: number[],
): string | null {
  const days = [...(athleteTrainingDays ?? [])]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  const dayOfWeek = days[sessionOrdinal - 1];
  if (dayOfWeek == null) return null;
  return scheduledDateForSlot(programStartDate, weekIndex, dayOfWeek);
}

/** Presets sugeridos según frecuencia (para el form de inscripción). */
export function defaultTrainingDaysForFrequency(sessionsPerWeek: number): number[] {
  switch (sessionsPerWeek) {
    case 2:
      return [0, 3];
    case 3:
      return [0, 2, 4];
    case 4:
      return [0, 1, 3, 4];
    case 5:
      return [0, 1, 2, 3, 4];
    default:
      return [0, 2, 4];
  }
}
