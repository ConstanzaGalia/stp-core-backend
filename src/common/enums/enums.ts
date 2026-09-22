export enum UserRole {
  STP_ADMIN = 'STP_ADMIN',
  DIRECTOR = 'DIRECTOR',
  TRAINER = 'TRAINER',
  SUB_TRAINER = 'SUB_TRAINER',
  SECRETARIA = 'SECRETARIA',
  /** Entrenador con acceso solo al portal de analytics de club (ATAH). */
  TRAINER_ONLY_ANALYTICS = 'TRAINER_ONLY_ANALYTICS',
  ATHLETE = 'ATHLETE',
}

export enum ClubAnalyticsSexScope {
  DAMAS = 'damas',
  CABALLEROS = 'caballeros',
  AMBOS = 'ambos',
}

export enum CompanyAccountType {
  TRAINING_CENTER = 'training_center',
  SPORTS_CLUB = 'sports_club',
}

/** Plan comercial de plataforma STP (SaaS B2B). */
export enum StpPlatformPlan {
  STP_PERSONAL = 'STP_PERSONAL',
  STP_CENTER = 'STP_CENTER',
  STP_CLUB = 'STP_CLUB',
}

export enum StpPlatformBillingKind {
  PAID = 'PAID',
  FREE = 'FREE',
}

export enum StpPlatformSubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum StpPlatformChargeConcept {
  SUBSCRIPTION = 'SUBSCRIPTION',
  ONBOARDING = 'ONBOARDING',
}

export enum StpPlatformChargeStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

export enum StpPlatformPaymentMethod {
  TRANSFER = 'transfer',
  CASH = 'cash',
  CARD = 'card',
  OTHER = 'other',
}

export enum EmailStatus {
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}