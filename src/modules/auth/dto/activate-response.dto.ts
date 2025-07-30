import { UserRole } from "src/common/enums/enums";

export class ActivateResponseDto {
  id: string;
  isActive: boolean;
  name: string;
  lastName: string;
  role: UserRole;
  token: string;
} 