import { StpPlatformPlan } from 'src/common/enums/enums';
import {
  getPublicPlatformPlan,
  PLATFORM_TRIAL_DAYS_DEFAULT,
  planIdFromSlug,
  resolvePlatformTrialDays,
} from './platform-plans.config';

describe('planIdFromSlug', () => {
  it.each([
    ['personal', StpPlatformPlan.STP_PERSONAL],
    ['center', StpPlatformPlan.STP_CENTER],
    ['STP_PERSONAL', StpPlatformPlan.STP_PERSONAL],
    ['STP_CENTER', StpPlatformPlan.STP_CENTER],
    ['  Center ', StpPlatformPlan.STP_CENTER],
  ])('normaliza %p', (input, expected) => {
    expect(planIdFromSlug(input)).toBe(expected);
  });

  it.each([[undefined], [null], [''], ['club'], ['STP_CLUB']])(
    'devuelve null para %p',
    (input) => {
      expect(planIdFromSlug(input as string | null | undefined)).toBeNull();
    },
  );
});

describe('resolvePlatformTrialDays', () => {
  it('usa el valor del env cuando es un número positivo', () => {
    expect(resolvePlatformTrialDays('30')).toBe(30);
    expect(resolvePlatformTrialDays('7.9')).toBe(7);
  });

  it.each([[undefined], [''], ['abc'], ['0'], ['-5']])(
    'cae al default (%p)',
    (input) => {
      expect(resolvePlatformTrialDays(input)).toBe(PLATFORM_TRIAL_DAYS_DEFAULT);
    },
  );
});

describe('getPublicPlatformPlan', () => {
  it('Center tiene migración y Personal no', () => {
    expect(getPublicPlatformPlan(StpPlatformPlan.STP_CENTER).migrationAmount).toBeGreaterThan(0);
    expect(getPublicPlatformPlan(StpPlatformPlan.STP_PERSONAL).migrationAmount).toBeNull();
  });
});
