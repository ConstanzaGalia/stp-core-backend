/** Modalidad que eligió la persona en la landing de atletas. */
export enum AthleteProgramModality {
  ONLINE = 'online',
  PRESENCIAL = 'presencial',
}

export const ATHLETE_PROGRAM_MODALITIES = Object.values(AthleteProgramModality);

/** Estado comercial del interesado en entrenar. */
export enum AthleteProgramLeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  EVALUATION = 'evaluation',
  ENROLLED = 'enrolled',
  NOT_NOW = 'not_now',
}

export const ATHLETE_PROGRAM_LEAD_STATUSES = Object.values(AthleteProgramLeadStatus);

/** Límite de altas por IP. */
export const ATHLETE_PROGRAM_LEAD_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
