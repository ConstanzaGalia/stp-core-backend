import { buildExerciseHistory, type ExerciseHistorySessionInput } from './exercise-history.util';

function session(input: {
  id: string;
  date: string;
  load: number;
  exerciseId?: string;
  skipped?: boolean;
}): ExerciseHistorySessionInput {
  return {
    id: input.id,
    scheduledDate: input.date,
    athleteCompletionStatus: input.skipped ? 'skipped' : 'completed',
    blocks: [
      {
        isEC: false,
        exercises: [
          {
            exerciseId: input.exerciseId ?? 'squat',
            exerciseName: 'Sentadilla',
            prescribedLoad: input.load,
          },
        ],
      },
    ],
  };
}

describe('buildExerciseHistory', () => {
  it('toma última y máxima incluyendo el día más reciente', () => {
    const exercises = buildExerciseHistory([
      session({ id: 's1', date: '2026-10-20', load: 80 }),
      session({ id: 's2', date: '2026-10-27', load: 85 }),
      session({ id: 's3', date: '2026-11-03', load: 102 }),
    ]);
    expect(exercises.squat.lastLoad).toBe(102);
    expect(exercises.squat.lastDate).toBe('2026-11-03');
    expect(exercises.squat.maxLoad).toBe(102);
    expect(exercises.squat.maxDate).toBe('2026-11-03');
  });

  it('excluye el día abierto para que un autoguardado no pise la referencia', () => {
    const exercises = buildExerciseHistory(
      [
        session({ id: 's1', date: '2026-10-20', load: 80 }),
        session({ id: 's2', date: '2026-10-27', load: 85 }),
        session({ id: 's3', date: '2026-11-03', load: 102 }),
      ],
      { excludeDates: ['2026-11-03'] },
    );
    expect(exercises.squat.lastLoad).toBe(85);
    expect(exercises.squat.lastDate).toBe('2026-10-27');
    expect(exercises.squat.maxLoad).toBe(85);
    expect(exercises.squat.maxDate).toBe('2026-10-27');
  });

  it('excluye la sesión abierta aunque la fecha no coincida', () => {
    const exercises = buildExerciseHistory(
      [
        session({ id: 's1', date: '2026-10-20', load: 80 }),
        session({ id: 's2', date: '2026-10-27', load: 90 }),
      ],
      { excludeSessionIds: ['s2'] },
    );
    expect(exercises.squat.lastLoad).toBe(80);
    expect(exercises.squat.maxLoad).toBe(80);
  });

  it('no usa una sesión skipped ni como última ni como máxima', () => {
    const exercises = buildExerciseHistory([
      session({ id: 's1', date: '2026-10-20', load: 80 }),
      session({ id: 's2', date: '2026-11-03', load: 120, skipped: true }),
    ]);
    expect(exercises.squat.lastLoad).toBe(80);
    expect(exercises.squat.maxLoad).toBe(80);
  });
});
