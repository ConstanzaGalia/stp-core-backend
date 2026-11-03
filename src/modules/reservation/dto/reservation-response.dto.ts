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
  canModify: boolean;
  hasStarted: boolean;
  changeDeadlineTime: string;
  cancelDeadline: Date;
  createdAt: Date;
} 