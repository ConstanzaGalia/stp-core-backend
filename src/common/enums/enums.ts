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

export enum EmailStatus {
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}