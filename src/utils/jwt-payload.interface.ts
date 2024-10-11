import { UserRole } from "src/common/enums/enums";

export interface JwtPayload {
  id: string;
  email: string;
  isActive: boolean;
  role: UserRole[];
  name: string;
  lastName: string;
}