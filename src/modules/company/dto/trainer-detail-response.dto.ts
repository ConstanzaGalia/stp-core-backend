import { UserRole } from 'src/common/enums/enums';

export class TrainerDetailResponseDto {
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
  companyId: string;
  companyName: string;
  createdAt: Date;
  updatedAt: Date;
} 