import { StpPlatformPlan } from 'src/common/enums/enums';

/** Planes comerciales públicos (Personal y Center). Se actualizan por IPC cada trimestre. */
export type PublicPlatformPlanId = StpPlatformPlan.STP_PERSONAL | StpPlatformPlan.STP_CENTER;

export type PublicPlatformPlan = {
  id: PublicPlatformPlanId;
  /** Clave corta usada en marketing: personal | center */
  slug: 'personal' | 'center';
  name: string;
  tagline: string;
  currency: 'ARS';
  onboardingAmount: number;
  monthlyAmount: number;
  /** Solo Center. */
  migrationAmount: number | null;
  athleteLimit: number;
  extraPackAmount: number;
  extraPackSize: number;
  modules: string[];
  addOns: string[];
  notes: string[];
};

export const PLATFORM_TRIAL_DAYS_DEFAULT = 14;

export const PUBLIC_PLATFORM_PLANS: Record<PublicPlatformPlanId, PublicPlatformPlan> = {
  [StpPlatformPlan.STP_PERSONAL]: {
    id: StpPlatformPlan.STP_PERSONAL,
    slug: 'personal',
    name: 'STP Personal',
    tagline: 'Para quien trabaja de forma individual con sus alumnos.',
    currency: 'ARS',
    onboardingAmount: 200_000,
    monthlyAmount: 85_000,
    migrationAmount: null,
    athleteLimit: 50,
    extraPackAmount: 45_000,
    extraPackSize: 50,
    modules: [
      'Planificación de entrenamientos',
      'App del alumno con tu marca',
      'Feedback (RPE, carga, dolor)',
      'Progreso y evaluaciones',
    ],
    addOns: [
      'Screening Biomecánico (se cotiza aparte)',
      'Evaluaciones Performance (se cotiza aparte)',
    ],
    notes: ['Actualización trimestral por IPC'],
  },
  [StpPlatformPlan.STP_CENTER]: {
    id: StpPlatformPlan.STP_CENTER,
    slug: 'center',
    name: 'STP Center',
    tagline: 'Para centros con equipo, turnos y cobros.',
    currency: 'ARS',
    onboardingAmount: 450_000,
    monthlyAmount: 200_000,
    migrationAmount: 100_000,
    athleteLimit: 250,
    extraPackAmount: 45_000,
    extraPackSize: 50,
    modules: [
      'Todo lo de Personal',
      'Turnos y reservas',
      'Cobros y mora',
      'Equipo con roles',
      'Marca blanca del centro',
    ],
    addOns: [
      'Screening Biomecánico (se cotiza aparte)',
      'Evaluaciones Performance (se cotiza aparte)',
      'Productos y ventas (se cotiza aparte)',
    ],
    notes: ['Actualización trimestral por IPC'],
  },
};

export function listPublicPlatformPlans(): PublicPlatformPlan[] {
  return [
    PUBLIC_PLATFORM_PLANS[StpPlatformPlan.STP_PERSONAL],
    PUBLIC_PLATFORM_PLANS[StpPlatformPlan.STP_CENTER],
  ];
}

export function getPublicPlatformPlan(
  id: PublicPlatformPlanId,
): PublicPlatformPlan {
  return PUBLIC_PLATFORM_PLANS[id];
}

export function planIdFromSlug(
  slug: string | null | undefined,
): PublicPlatformPlanId | null {
  const normalized = slug?.trim().toLowerCase();
  if (normalized === 'personal') return StpPlatformPlan.STP_PERSONAL;
  if (normalized === 'center') return StpPlatformPlan.STP_CENTER;
  // El enum está en mayúsculas ('STP_PERSONAL') y `normalized` en minúsculas: comparar en minúsculas.
  if (normalized === StpPlatformPlan.STP_PERSONAL.toLowerCase()) {
    return StpPlatformPlan.STP_PERSONAL;
  }
  if (normalized === StpPlatformPlan.STP_CENTER.toLowerCase()) {
    return StpPlatformPlan.STP_CENTER;
  }
  return null;
}

export function resolvePlatformTrialDays(
  envValue: string | undefined,
): number {
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return PLATFORM_TRIAL_DAYS_DEFAULT;
}
