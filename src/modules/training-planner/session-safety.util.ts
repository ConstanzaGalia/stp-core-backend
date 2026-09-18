export interface SafetyConflict {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  conflictingTagKeys: string[];
}

export interface ExerciseSafetyLike {
  id: string;
  name?: string | null;
  safetyTags?: Array<{ key?: string | null } | string> | null;
}

function normalizeTagKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function collectExerciseIdsFromBlocks(blocks: unknown[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks ?? []) {
    if (!block || typeof block !== 'object') continue;
    const exercises = (block as { exercises?: unknown[] }).exercises;
    if (!Array.isArray(exercises)) continue;
    for (const exercise of exercises) {
      if (!exercise || typeof exercise !== 'object') continue;
      const exerciseId = (exercise as { exerciseId?: string }).exerciseId;
      if (typeof exerciseId === 'string' && exerciseId.trim()) {
        ids.add(exerciseId.trim());
      }
    }
  }
  return [...ids];
}

export function extractExerciseSafetyKeys(
  exercise: ExerciseSafetyLike | undefined | null,
): string[] {
  if (!exercise?.safetyTags?.length) return [];
  const keys: string[] = [];
  for (const tag of exercise.safetyTags) {
    const raw = typeof tag === 'string' ? tag : tag?.key;
    if (typeof raw === 'string' && raw.trim()) {
      keys.push(normalizeTagKey(raw));
    }
  }
  return keys;
}

/**
 * Detecta conflictos entre ejercicios de una sesión y restricciones activas del atleta.
 * Regla: intersección no vacía entre safetyTags del ejercicio y activeRestrictionKeys.
 */
export function detectSafetyConflicts(
  blocks: unknown[],
  exercisesById: Map<string, ExerciseSafetyLike>,
  activeRestrictionKeys: string[],
): SafetyConflict[] {
  const normalizedRestrictions = activeRestrictionKeys
    .filter((key) => typeof key === 'string' && key.trim())
    .map(normalizeTagKey);
  if (normalizedRestrictions.length === 0) return [];

  const restrictionSet = new Set(normalizedRestrictions);
  const conflicts: SafetyConflict[] = [];

  for (const block of blocks ?? []) {
    if (!block || typeof block !== 'object') continue;
    const exercises = (block as { exercises?: unknown[] }).exercises;
    if (!Array.isArray(exercises)) continue;

    for (const raw of exercises) {
      if (!raw || typeof raw !== 'object') continue;
      const ex = raw as {
        id?: string;
        exerciseId?: string;
        exerciseName?: string;
      };
      const exerciseId =
        typeof ex.exerciseId === 'string' ? ex.exerciseId.trim() : '';
      if (!exerciseId) continue;

      const catalog = exercisesById.get(exerciseId);
      const tagKeys = extractExerciseSafetyKeys(catalog);
      const conflictingTagKeys = tagKeys.filter((key) => restrictionSet.has(key));
      if (conflictingTagKeys.length === 0) continue;

      conflicts.push({
        sessionExerciseId:
          typeof ex.id === 'string' && ex.id.trim() ? ex.id.trim() : exerciseId,
        exerciseId,
        exerciseName:
          (typeof ex.exerciseName === 'string' && ex.exerciseName.trim()) ||
          catalog?.name?.trim() ||
          exerciseId,
        conflictingTagKeys,
      });
    }
  }

  return conflicts;
}

export function buildSafetyConflictWarnings(conflicts: SafetyConflict[]): string[] {
  return conflicts.map(
    (c) =>
      `Conflicto de lesión: ${c.exerciseName} (${c.conflictingTagKeys.join(', ')})`,
  );
}

export function mergeSessionWarnings(
  existing: string[] | null | undefined,
  safetyWarnings: string[],
): string[] {
  const kept = (existing ?? []).filter(
    (w) => typeof w === 'string' && !w.startsWith('Conflicto de lesión:'),
  );
  return [...kept, ...safetyWarnings];
}
