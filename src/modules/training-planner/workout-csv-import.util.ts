/** Parseo canónico de CSV de workouts → biblioteca. */

export interface CsvWorkoutExerciseRow {
  exerciseName: string;
  sets: number;
  reps: string;
  restSeconds: number;
  /** true si el usuario omitió esta fila en la revisión. */
  omit?: boolean;
}

export interface CsvWorkoutBlockRow {
  blockTitle: string;
  blockOrder: number;
  isEc: boolean;
  exercises: CsvWorkoutExerciseRow[];
}

export interface CsvParsedWorkout {
  workoutName: string;
  phase: string | null;
  pattern: string | null;
  blocks: CsvWorkoutBlockRow[];
}

export interface CsvParseResult {
  workouts: CsvParsedWorkout[];
  uniqueExerciseNames: string[];
  warnings: string[];
}

function detectDelimiter(headerLine: string): ';' | ',' {
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

function splitCsvLine(line: string, delimiter: ';' | ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'si' || v === 'sí';
}

function parseIntSafe(value: string, fallback: number): number {
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

const REQUIRED_HEADERS = [
  'workout_name',
  'phase',
  'pattern',
  'block_title',
  'block_order',
  'is_ec',
  'exercise_name',
  'sets',
  'reps',
  'rest_seconds',
] as const;

/**
 * Parsea CSV con header canónico. Filas del mismo workout_name = un template.
 */
export function parseWorkoutCsv(csvText: string): CsvParseResult {
  const warnings: string[] = [];
  const text = (csvText ?? '').replace(/^\uFEFF/, '').trim();
  if (!text) {
    return { workouts: [], uniqueExerciseNames: [], warnings: ['CSV vacío.'] };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return {
      workouts: [],
      uniqueExerciseNames: [],
      warnings: ['El CSV necesita header y al menos una fila de datos.'],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, '_'),
  );
  const index: Record<string, number> = {};
  for (let i = 0; i < headerCells.length; i++) {
    index[headerCells[i]] = i;
  }
  for (const key of REQUIRED_HEADERS) {
    if (index[key] === undefined) {
      return {
        workouts: [],
        uniqueExerciseNames: [],
        warnings: [`Falta la columna requerida: ${key}`],
      };
    }
  }

  type FlatRow = {
    workoutName: string;
    phase: string;
    pattern: string;
    blockTitle: string;
    blockOrder: number;
    isEc: boolean;
    exerciseName: string;
    sets: number;
    reps: string;
    restSeconds: number;
  };

  const flat: FlatRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li], delimiter);
    const workoutName = (cells[index.workout_name] ?? '').trim();
    const exerciseName = (cells[index.exercise_name] ?? '').trim();
    if (!workoutName || !exerciseName) {
      warnings.push(`Fila ${li + 1}: workout_name o exercise_name vacío; se omite.`);
      continue;
    }
    flat.push({
      workoutName,
      phase: (cells[index.phase] ?? '').trim(),
      pattern: (cells[index.pattern] ?? '').trim(),
      blockTitle: (cells[index.block_title] ?? '').trim() || 'C1',
      blockOrder: parseIntSafe(cells[index.block_order] ?? '1', 1),
      isEc: parseBool(cells[index.is_ec] ?? ''),
      exerciseName,
      sets: Math.max(1, parseIntSafe(cells[index.sets] ?? '3', 3)),
      reps: (cells[index.reps] ?? '').trim() || '8',
      restSeconds: Math.max(0, parseIntSafe(cells[index.rest_seconds] ?? '90', 90)),
    });
  }

  const byWorkout = new Map<string, FlatRow[]>();
  for (const row of flat) {
    const list = byWorkout.get(row.workoutName) ?? [];
    list.push(row);
    byWorkout.set(row.workoutName, list);
  }

  const workouts: CsvParsedWorkout[] = [];
  for (const [workoutName, rows] of byWorkout) {
    const phase = rows[0]?.phase || null;
    const pattern = rows[0]?.pattern || null;
    const blockMap = new Map<string, CsvWorkoutBlockRow>();
    for (const row of rows) {
      const key = `${row.blockOrder}::${row.blockTitle}::${row.isEc ? 'ec' : 'main'}`;
      let block = blockMap.get(key);
      if (!block) {
        block = {
          blockTitle: row.blockTitle,
          blockOrder: row.blockOrder,
          isEc: row.isEc,
          exercises: [],
        };
        blockMap.set(key, block);
      }
      block.exercises.push({
        exerciseName: row.exerciseName,
        sets: row.sets,
        reps: row.reps,
        restSeconds: row.restSeconds,
      });
    }
    const blocks = [...blockMap.values()].sort((a, b) => a.blockOrder - b.blockOrder);
    workouts.push({ workoutName, phase, pattern, blocks });
  }

  const uniqueNames = [
    ...new Set(flat.map((r) => r.exerciseName).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  return { workouts, uniqueExerciseNames: uniqueNames, warnings };
}
