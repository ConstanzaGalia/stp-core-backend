import { UserRole } from 'src/common/enums/enums';

export class ReservationResponseDto {
  id: string;
  userId: string;
  timeSlotId: string;
  date: Date;
  startTime: string;
  endTime: string;
  companyName: string;
  canCancel: boolean;
  cancelDeadline: Date;
  createdAt: Date;
} 