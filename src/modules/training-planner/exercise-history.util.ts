export type ExerciseLoadSource = 'actual' | 'prescribed';

export interface ExerciseHistoryEntry {
  date: string;
  sessionId: string;
  loadKg: number;
  reps: number | null;
  rpe: number | null;
  pain: boolean;
  source: ExerciseLoadSource;
}

export interface ExerciseHistorySummary {
  exerciseId: string;
  exerciseName: string | null;
  lastLoad: number | null;
  lastReps: number | null;
  lastRpe: number | null;
  lastPain: boolean | null;
  lastDate: string | null;
  lastSource: ExerciseLoadSource | null;
  maxLoad: number | null;
  maxDate: string | null;
  recent: ExerciseHistoryEntry[];
}

export interface ExerciseHistorySessionInput {
  id: string;
  scheduledDate: string;
  athleteCompletionStatus?: string | null;
  blocks: unknown;
}

const DEFAULT_RECENT_LIMIT = 6;

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseReps(value: unknown): number | null {
  const direct = asNumber(value);
  if (direct != null) return Math.round(direct);
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function compareDateDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

/**
 * Recorre los bloques JSONB de las sesiones y arma último / máximo por ejercicio.
 * Usa carga real si hay feedback; si no, la prescrita. Omite sesiones skipped y bloques EC.
 */
export function buildExerciseHistory(
  sessions: ExerciseHistorySessionInput[],
  options?: { recentLimit?: number },
): Record<string, ExerciseHistorySummary> {
  const recentLimit = Math.max(1, options?.recentLimit ?? DEFAULT_RECENT_LIMIT);
  const byId = new Map<string, ExerciseHistorySummary>();

  const ordered = [...sessions].sort((a, b) =>
    compareDateDesc(a.scheduledDate ?? '', b.scheduledDate ?? ''),
  );

  for (const session of ordered) {
    if ((session.athleteCompletionStatus ?? 'pending') === 'skipped') continue;
    const date = String(session.scheduledDate ?? '').slice(0, 10);
    if (!date) continue;
    const blocks = Array.isArray(session.blocks) ? session.blocks : [];

    for (const rawBlock of blocks) {
      if (!rawBlock || typeof rawBlock !== 'object') continue;
      const block = rawBlock as { isEC?: boolean; exercises?: unknown[] };
      if (block.isEC) continue;
      if (!Array.isArray(block.exercises)) continue;

      for (const rawExercise of block.exercises) {
        if (!rawExercise || typeof rawExercise !== 'object') continue;
        const exercise = rawExercise as {
          exerciseId?: string;
          exerciseName?: string;
          prescribedLoad?: unknown;
          prescribedReps?: unknown;
          actualFeedback?: {
            actualLoad?: unknown;
            actualReps?: unknown;
            rpe?: unknown;
            pain?: unknown;
          } | null;
        };
        const exerciseId =
          typeof exercise.exerciseId === 'string' ? exercise.exerciseId.trim() : '';
        if (!exerciseId) continue;

        const actualLoad = asNumber(exercise.actualFeedback?.actualLoad);
        const prescribedLoad = asNumber(exercise.prescribedLoad);
        const loadKg = actualLoad ?? prescribedLoad;
        if (loadKg == null) continue;

        const source: ExerciseLoadSource = actualLoad != null ? 'actual' : 'prescribed';
        const reps =
          parseReps(exercise.actualFeedback?.actualReps) ??
          parseReps(exercise.prescribedReps);
        const rpeRaw = exercise.actualFeedback?.rpe;
        const rpe =
          typeof rpeRaw === 'number' && Number.isFinite(rpeRaw) ? rpeRaw : null;
        const pain = exercise.actualFeedback?.pain === true;

        const entry: ExerciseHistoryEntry = {
          date,
          sessionId: session.id,
          loadKg,
          reps,
          rpe,
          pain,
          source,
        };

        let summary = byId.get(exerciseId);
        if (!summary) {
          summary = {
            exerciseId,
            exerciseName:
              typeof exercise.exerciseName === 'string' && exercise.exerciseName.trim()
                ? exercise.exerciseName.trim()
                : null,
            lastLoad: null,
            lastReps: null,
            lastRpe: null,
            lastPain: null,
            lastDate: null,
            lastSource: null,
            maxLoad: null,
            maxDate: null,
            recent: [],
          };
          byId.set(exerciseId, summary);
        } else if (!summary.exerciseName && typeof exercise.exerciseName === 'string') {
          summary.exerciseName = exercise.exerciseName.trim() || summary.exerciseName;
        }

        if (summary.lastDate == null || date > summary.lastDate) {
          summary.lastLoad = loadKg;
          summary.lastReps = reps;
          summary.lastRpe = rpe;
          summary.lastPain = source === 'actual' ? pain : null;
          summary.lastDate = date;
          summary.lastSource = source;
        }

        if (summary.maxLoad == null || loadKg > summary.maxLoad) {
          summary.maxLoad = loadKg;
          summary.maxDate = date;
        }

        summary.recent.push(entry);
      }
    }
  }

  const result: Record<string, ExerciseHistorySummary> = {};
  for (const [id, summary] of byId) {
    summary.recent.sort((a, b) => compareDateDesc(a.date, b.date) || b.loadKg - a.loadKg);
    summary.recent = summary.recent.slice(0, recentLimit);
    result[id] = summary;
  }
  return result;
}
