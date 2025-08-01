import { Controller, Post, Param, Delete, Body, Get, Put, UseGuards } from '@nestjs/common';
import { ReservationsService } from './reservation.service';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { CreateTimeSlotsDto } from './dto/createTimeSlot.dto';
import { CreateScheduleConfigDto } from './dto/create-schedule-config.dto';
import { UpdateScheduleConfigDto } from './dto/update-schedule-config.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';


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
  @UseGuards(AuthGuard('jwt'))
  async cancelReservation(
    @Param('reservationId') reservationId: string,
    @GetUser() user: User,
  ) {
    await this.reservationsService.cancelReservation(reservationId, user.id);
  }

  // Endpoints para configuración de horarios
  @Post('schedule-config/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async createScheduleConfig(
    @Param('companyId') companyId: string,
    @Body() createScheduleConfigDto: CreateScheduleConfigDto,
  ) {
    return this.reservationsService.createScheduleConfig(companyId, createScheduleConfigDto);
  }

  @Get('schedule-config/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getScheduleConfigs(@Param('companyId') companyId: string) {
    return this.reservationsService.getScheduleConfigs(companyId);
  }

  @Put('schedule-config/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateScheduleConfig(
    @Param('id') id: string,
    @Body() updateScheduleConfigDto: UpdateScheduleConfigDto,
  ) {
    return this.reservationsService.updateScheduleConfig(id, updateScheduleConfigDto);
  }

  @Delete('schedule-config/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteScheduleConfig(@Param('id') id: string) {
    await this.reservationsService.deleteScheduleConfig(id);
  }

  @Post('generate-timeslots/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async generateTimeSlotsFromConfig(
    @Param('companyId') companyId: string,
    @Body() body: { startDate: Date; endDate: Date },
  ) {
    return this.reservationsService.generateTimeSlotsFromConfig(
      companyId,
      body.startDate,
      body.endDate,
    );
  }

  @Get('user/:userId')
  @UseGuards(AuthGuard('jwt'))
  async getUserReservations(@Param('userId') userId: string) {
    return this.reservationsService.getUserReservations(userId);
  }
}
