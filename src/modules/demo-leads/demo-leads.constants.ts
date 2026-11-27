/** Estado comercial del lead de la demo pública. */
export enum DemoLeadStatus {
  NEW = 'new',
  DEMO_VIEWED = 'demo_viewed',
  CONTACTED = 'contacted',
  WANTS_TO_START = 'wants_to_start',
  CUSTOMER = 'customer',
}

export const DEMO_LEAD_STATUSES = Object.values(DemoLeadStatus);

/**
 * Orden de avance del embudo. Las transiciones automáticas (vio la demo,
 * quiere empezar) solo avanzan: un lead `contacted` o `customer` nunca retrocede.
 */
const STATUS_RANK: Record<DemoLeadStatus, number> = {
  [DemoLeadStatus.NEW]: 0,
  [DemoLeadStatus.DEMO_VIEWED]: 1,
  [DemoLeadStatus.CONTACTED]: 2,
  [DemoLeadStatus.WANTS_TO_START]: 3,
  [DemoLeadStatus.CUSTOMER]: 4,
};

export function advanceDemoLeadStatus(
  current: DemoLeadStatus,
  next: DemoLeadStatus,
): DemoLeadStatus {
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current;
}

export enum DemoLeadEventType {
  LEAD_CAPTURED = 'lead_captured',
  DEMO_STEP_VIEWED = 'demo_step_viewed',
  DEMO_COMPLETED = 'demo_completed',
  START_CLICKED = 'start_clicked',
}

/** Eventos que el navegador puede reportar (el alta del lead se registra en su propio endpoint). */
export const DEMO_CLIENT_EVENT_TYPES = [
  DemoLeadEventType.DEMO_STEP_VIEWED,
  DemoLeadEventType.DEMO_COMPLETED,
  DemoLeadEventType.START_CLICKED,
] as const;

export enum DemoLeadPlan {
  PERSONAL = 'personal',
  CENTER = 'center',
}

export function parseDemoLeadPlan(value: string | null | undefined): DemoLeadPlan | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === DemoLeadPlan.PERSONAL) return DemoLeadPlan.PERSONAL;
  if (normalized === DemoLeadPlan.CENTER) return DemoLeadPlan.CENTER;
  return null;
}

/** Límite de altas de lead por IP. */
export const DEMO_LEAD_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

/** Tope de eventos por lead (evita inflar la tabla con un token válido). */
export const DEMO_LEAD_MAX_EVENTS = 300;

/** Validez del token que habilita a registrar eventos de la demo. */
export const DEMO_LEAD_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Nombres de evento para el píxel de Meta y Conversions API (mismos en navegador y servidor). */
export const META_EVENT_NAMES = {
  [DemoLeadEventType.LEAD_CAPTURED]: 'Lead',
  [DemoLeadEventType.DEMO_COMPLETED]: 'DemoCompleted',
} as const;
