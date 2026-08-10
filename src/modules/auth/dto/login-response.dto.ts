import { UserRole } from "src/common/enums/enums";

export class LoginResponseDto {
  id: string;
  token: string;
  isActive: boolean;
  name: string;
  lastName: string;
  role: UserRole;
  /** Solo lectura: participante "solo evaluaciones" (portal). */
  evaluationPortalOnly?: boolean;
  /** Perfil de acceso al portal analytics de club (TRAINER_ONLY_ANALYTICS). */
  clubAnalytics?: {
    accessId: string;
    companyId: string;
    companyName: string | null;
    clubCode: string;
    clubLabel: string | null;
    sexScope: string;
    sexScopeLabel: string;
  };
} 