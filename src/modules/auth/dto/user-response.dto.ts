import { UserRole } from "src/common/enums/enums";

export class UserRegiter {
  id: string;
  name: string;
  lastName: string;
  email: string;
  role: UserRole;
  activeToken: string;
  isActive: boolean;
  token: string;
}