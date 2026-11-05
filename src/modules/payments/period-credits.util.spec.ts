import { aggregatePeriodCredits } from './period-credits.service';

describe('aggregatePeriodCredits', () => {
  it('cuenta planilla + marked como consumidas y resta pendientes', () => {
    // cupo 8, 5 planilla, 0 marked, 1 pending real → 2 libres
    expect(aggregatePeriodCredits(0, 5, 1, 8)).toEqual({
      consumidas: 5,
      reservasPendientes: 1,
      libres: 2,
    });
  });

  it('día con planilla + reserva pendiente no debe sumar esa pendiente (regla post-fix)', () => {
    // Tras el fix SQL, pending ya no incluye reservas del mismo día que planilla.
    // Simula el caso Mariana: 5 planilla, 1 pending (solo 6/11), cupo 8 → 2 libres.
    const beforeFixDoubleCount = aggregatePeriodCredits(0, 5, 3, 8);
    expect(beforeFixDoubleCount.libres).toBe(0);

    const afterFix = aggregatePeriodCredits(0, 5, 1, 8);
    expect(afterFix).toEqual({
      consumidas: 5,
      reservasPendientes: 1,
      libres: 2,
    });
  });

  it('al marcar asistencia el día deja de contar planilla y pasa a marked', () => {
    // Antes: 1 planilla + 0 marked + 0 pending
    expect(aggregatePeriodCredits(0, 1, 0, 8).consumidas).toBe(1);
    // Después de marcar: 1 marked + 0 planilla (planilla excluye días con attendance)
    expect(aggregatePeriodCredits(1, 0, 0, 8).consumidas).toBe(1);
  });

  it('nunca deja libres negativos ni consumidas sobre el cupo', () => {
    expect(aggregatePeriodCredits(10, 5, 2, 8)).toEqual({
      consumidas: 8,
      reservasPendientes: 2,
      libres: 0,
    });
  });
});
