import {
  calendarDateInArgentina,
  getCalendarWeekBoundsFromYmd,
  toDateOnlyKey,
} from './date-only.util';

describe('getCalendarWeekBoundsFromYmd / cupo semanal Argentina', () => {
  it('lunes 9 nov 2026 13:10 UTC (10:10 ART) → semana 9–15 nov', () => {
    const ymd = calendarDateInArgentina(new Date('2026-11-09T13:10:00.000Z'));
    expect(ymd).toBe('2026-11-09');
    expect(getCalendarWeekBoundsFromYmd(ymd)).toEqual({
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
    });
  });

  it('domingo 8 nov 2026 22:00 ART (lunes 01:00 UTC) → sigue en semana 2–8 nov', () => {
    const ymd = calendarDateInArgentina(new Date('2026-11-09T01:00:00.000Z'));
    expect(ymd).toBe('2026-11-08');
    expect(getCalendarWeekBoundsFromYmd(ymd)).toEqual({
      weekStart: '2026-11-02',
      weekEnd: '2026-11-08',
    });
  });

  it('fecha de turno 2026-11-09T00:00:00Z → semana del 9 al 15, no la anterior', () => {
    const slotYmd = toDateOnlyKey(new Date('2026-11-09T00:00:00.000Z'));
    expect(slotYmd).toBe('2026-11-09');
    expect(getCalendarWeekBoundsFromYmd(slotYmd!)).toEqual({
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
    });
  });
});
