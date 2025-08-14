import { UserRole } from 'src/common/enums/enums';

export class TrainerProfileResponseDto {
  id: string;
  email: string;
  name: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  phoneNumber?: string;
  country?: string;
  city?: string;
  imageProfile?: string;
  specialty?: string;
  biography?: string;
  experienceYears?: number;
  createdAt: Date;
  updatedAt: Date;
  companies: any[];
  hireDate?: Date; // Fecha de contratación (asociación al centro)
} 