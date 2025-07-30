import { UserRole } from "src/common/enums/enums";

export class LoginResponseDto {
  id: string;
  token: string;
  isActive: boolean;
  name: string;
  lastName: string;
  role: UserRole;
} 