import { UserRole } from 'src/common/enums/enums';

export class TrainerResponseDto {
  id: string;
  email: string;
  name: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  phoneNumber?: number;
  country?: string;
  city?: string;
  imageProfile?: string;
  associationDate?: Date;
} 