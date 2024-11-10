import { Controller, Post, Param, Delete, Body } from '@nestjs/common';
import { ReservationsService } from './reservation.service';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { CreateTimeSlotsDto } from './dto/createTimeSlot.dto';


@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('timeslots')
  async createTimeSlots(@Body() createTimeSlotsDto: CreateTimeSlotsDto): Promise<TimeSlot[]> {
    const { companyId, daysOfWeek, startTime, endTime, capacity, startDate, endDate } = createTimeSlotsDto;

    return this.reservationsService.createTimeSlots(
      companyId,
      daysOfWeek,
      startTime,
      endTime,
      capacity,
      startDate,
      endDate,
    );
  }

  @Post(':userId/:timeSlotId')
  async createReservation(
    @Param('userId') userId: string,
    @Param('timeSlotId') timeSlotId: string,
  ) {
    return this.reservationsService.createReservation(userId, timeSlotId);
  }

  @Delete(':reservationId')
  async cancelReservation(@Param('reservationId') reservationId: string) {
    await this.reservationsService.cancelReservation(reservationId);
  }
}
