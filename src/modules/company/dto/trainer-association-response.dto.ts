import { UserRole } from 'src/common/enums/enums';

export class TrainerAssociationResponseDto {
  id: string;
  email: string;
  name: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  companyId: string;
  companyName: string;
  associationDate: Date;
} 