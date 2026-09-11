export type TrainingInactivityBucket =
  | 'neverTrained'
  | 'oneToTwoWeeks'
  | 'twoWeeksOrMore'
  | 'recentlyActive';

export type TrainingInactivityAthleteInput = {
  athleteId: string;
  name: string;
  lastName: string;
  /** Último entrenamiento con asistencia confirmada. */
  lastTrainingDate: string | null;
  /** Última sesión con rutina planificada (puede ser futura). */
  lastPlannedDate: string | null;
};

export type TrainingInactivityAthlete = TrainingInactivityAthleteInput & {
  daysSinceLastTraining: number | null;
  daysSinceLastPlanned: number | null;
  bucket: TrainingInactivityBucket;
};

export const ONE_WEEK_DAYS = 7;
export const TWO_WEEK_DAYS = 14;

/** Diferencia en días calendario entre dos fechas YYYY-MM-DD. */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = parseYmdParts(fromYmd);
  const to = parseYmdParts(toYmd);
  if (!from || !to) return 0;
  const fromUtc = Date.UTC(from.y, from.m - 1, from.d);
  const toUtc = Date.UTC(to.y, to.m - 1, to.d);
  return Math.floor((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

function parseYmdParts(
  value: string,
): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

/**
 * Sesión confirmada (alineado con frontend isConfirmedSession):
 * fecha <= hoy, no skipped, y completed o feedback pendiente/aprobado.
 */
export function isConfirmedTrainingSession(
  session: {
    scheduledDate: string;
    athleteCompletionStatus?: string | null;
    feedbackStatus?: string | null;
  },
  referenceDateYmd: string,
): boolean {
  if (session.scheduledDate > referenceDateYmd) return false;
  if (session.athleteCompletionStatus === 'skipped') return false;
  return (
    session.feedbackStatus === 'pending_review' ||
    session.feedbackStatus === 'approved' ||
    session.athleteCompletionStatus === 'completed'
  );
}

export function classifyTrainingInactivity(
  lastTrainingDate: string | null,
  referenceDateYmd: string,
): { daysSinceLastTraining: number | null; bucket: TrainingInactivityBucket } {
  if (!lastTrainingDate) {
    return { daysSinceLastTraining: null, bucket: 'neverTrained' };
  }

  const days = Math.max(0, daysBetweenYmd(lastTrainingDate, referenceDateYmd));

  if (days >= TWO_WEEK_DAYS) {
    return { daysSinceLastTraining: days, bucket: 'twoWeeksOrMore' };
  }
  if (days >= ONE_WEEK_DAYS) {
    return { daysSinceLastTraining: days, bucket: 'oneToTwoWeeks' };
  }
  return { daysSinceLastTraining: days, bucket: 'recentlyActive' };
}

/** Días desde la última planificación; null si no hay o si es futura. */
export function daysSincePlannedDate(
  lastPlannedDate: string | null,
  referenceDateYmd: string,
): number | null {
  if (!lastPlannedDate) return null;
  const days = daysBetweenYmd(lastPlannedDate, referenceDateYmd);
  if (days < 0) return null;
  return days;
}

function toYmdKey(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match?.[1] ?? null;
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Alineado con resolveAthleteOperationalStatus del frontend:
 * inactivo si alguna suspensión (no desactivada) solapa el mes de referencia.
 */
export function suspensionOverlapsMonth(
  suspension: {
    startDate: string | Date;
    endDate: string | Date;
    isActive?: boolean;
  },
  referenceDateYmd: string,
): boolean {
  if (suspension.isActive === false) return false;
  const start = toYmdKey(suspension.startDate);
  const end = toYmdKey(suspension.endDate);
  const ref = parseYmdParts(referenceDateYmd);
  if (!start || !end || !ref) return false;

  const monthStart = `${ref.y}-${String(ref.m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(ref.y, ref.m, 0)).getUTCDate();
  const monthEnd = `${ref.y}-${String(ref.m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return start <= monthEnd && end >= monthStart;
}

export function collectSuspendedAthleteIds(
  suspensions: Array<{
    userId?: string | null;
    startDate: string | Date;
    endDate: string | Date;
    isActive?: boolean;
  }>,
  referenceDateYmd: string,
): Set<string> {
  const ids = new Set<string>();
  for (const suspension of suspensions) {
    const userId = suspension.userId?.trim();
    if (!userId) continue;
    if (suspensionOverlapsMonth(suspension, referenceDateYmd)) {
      ids.add(userId);
    }
  }
  return ids;
}

function compareInactivityDesc(
  a: TrainingInactivityAthlete,
  b: TrainingInactivityAthlete,
): number {
  if (a.daysSinceLastTraining === null && b.daysSinceLastTraining === null) {
    return `${a.lastName}${a.name}`.localeCompare(`${b.lastName}${b.name}`);
  }
  if (a.daysSinceLastTraining === null) return -1;
  if (b.daysSinceLastTraining === null) return 1;
  if (b.daysSinceLastTraining !== a.daysSinceLastTraining) {
    return b.daysSinceLastTraining - a.daysSinceLastTraining;
  }
  return `${a.lastName}${a.name}`.localeCompare(`${b.lastName}${b.name}`);
}

export function buildTrainingInactivityGroups(
  athletes: TrainingInactivityAthleteInput[],
  referenceDateYmd: string,
) {
  const classified: TrainingInactivityAthlete[] = athletes.map((athlete) => {
    const { daysSinceLastTraining, bucket } = classifyTrainingInactivity(
      athlete.lastTrainingDate,
      referenceDateYmd,
    );
    return {
      ...athlete,
      lastPlannedDate: athlete.lastPlannedDate ?? null,
      daysSinceLastTraining,
      daysSinceLastPlanned: daysSincePlannedDate(
        athlete.lastPlannedDate,
        referenceDateYmd,
      ),
      bucket,
    };
  });

  const neverTrained = classified
    .filter((a) => a.bucket === 'neverTrained')
    .sort(compareInactivityDesc);
  const twoWeeksOrMore = classified
    .filter((a) => a.bucket === 'twoWeeksOrMore')
    .sort(compareInactivityDesc);
  const oneToTwoWeeks = classified
    .filter((a) => a.bucket === 'oneToTwoWeeks')
    .sort(compareInactivityDesc);
  const recentlyActive = classified
    .filter((a) => a.bucket === 'recentlyActive')
    .sort(compareInactivityDesc);

  return {
    referenceDate: referenceDateYmd,
    thresholds: {
      oneWeekDays: ONE_WEEK_DAYS,
      twoWeekDays: TWO_WEEK_DAYS,
    },
    summary: {
      totalActiveAthletes: classified.length,
      recentlyActive: recentlyActive.length,
      inactiveOneToTwoWeeks: oneToTwoWeeks.length,
      inactiveTwoWeeksOrMore: twoWeeksOrMore.length,
      neverTrained: neverTrained.length,
    },
    groups: {
      neverTrained,
      twoWeeksOrMore,
      oneToTwoWeeks,
    },
  };
}
