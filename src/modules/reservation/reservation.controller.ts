import { Controller, Post, Param, Delete, Body, Get, Put, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ReservationsService } from './reservation.service';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { CreateTimeSlotsDto } from './dto/createTimeSlot.dto';
import { CreateScheduleConfigDto } from './dto/create-schedule-config.dto';
import { UpdateScheduleConfigDto } from './dto/update-schedule-config.dto';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { UpdateScheduleExceptionDto } from './dto/update-schedule-exception.dto';
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
    @Body() body: { startDate: string; endDate: string },
  ) {
    // Parsear las fechas y ajustar a la zona horaria local
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    
    // Validar que las fechas sean válidas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Fechas inválidas. Use formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)');
    }
    
    // Ajustar las fechas para que se procesen correctamente
    // Si la fecha viene como "2025-08-01T00:00:00.000Z", queremos que sea 1 de agosto, no 31 de julio
    const adjustedStartDate = new Date(startDate.getTime() + (startDate.getTimezoneOffset() * 60000));
    const adjustedEndDate = new Date(endDate.getTime() + (endDate.getTimezoneOffset() * 60000));

    return this.reservationsService.generateTimeSlotsFromConfig(
      companyId,
      adjustedStartDate,
      adjustedEndDate,
    );
  }

  @Get('timeslots/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getTimeSlots(
    @Param('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.reservationsService.getAvailableTimeSlots(companyId, start, end);
  }

  @Get('schedule-config-status/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getScheduleConfigStatus(@Param('companyId') companyId: string) {
    const configs = await this.reservationsService.getScheduleConfigs(companyId);
    return {
      totalConfigs: configs.length,
      activeConfigs: configs.filter(c => c.isActive).length,
      configs: configs.map(config => ({
        id: config.id,
        dayOfWeek: config.dayOfWeek,
        dayName: this.reservationsService.getDayName(config.dayOfWeek),
        startTime: config.startTime,
        endTime: config.endTime,
        capacity: config.capacity,
        isActive: config.isActive
      }))
    };
  }

  @Get('time-slot-generations/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getTimeSlotGenerations(
    @Param('companyId') companyId: string,
    @Query() paginationQuery: PaginationQueryDto,
  ) {
    const { page = 1, limit = 10 } = paginationQuery;
    return this.reservationsService.getTimeSlotGenerations(companyId, page, limit);
  }

  @Delete('time-slot-generations/:companyId/:generationId')
  @UseGuards(AuthGuard('jwt'))
  async deleteTimeSlotGeneration(
    @Param('companyId') companyId: string,
    @Param('generationId') generationId: string,
  ) {
    return this.reservationsService.deleteTimeSlotGeneration(generationId, companyId);
  }

  @Post('generate-timeslots-with-exceptions/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async generateTimeSlotsWithExceptions(
    @Param('companyId') companyId: string,
    @Body() body: { startDate: string; endDate: string },
  ) {
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    
    // Validar que las fechas sean válidas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Fechas inválidas. Use formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)');
    }
    
    return this.reservationsService.generateTimeSlotsWithExceptions(
      companyId,
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

  @Get('user/:userId')
  @UseGuards(AuthGuard('jwt'))
  async getUserReservations(@Param('userId') userId: string) {
    return this.reservationsService.getUserReservations(userId);
  }

  // Endpoints para gestión de excepciones de horarios
  @Post('schedule-exception/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async createScheduleException(
    @Param('companyId') companyId: string,
    @Body() createScheduleExceptionDto: CreateScheduleExceptionDto,
  ) {
    return await this.reservationsService.createScheduleException(companyId, createScheduleExceptionDto);
  }

  @Get('schedule-exception/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getScheduleExceptions(@Param('companyId') companyId: string) {
    return await this.reservationsService.getScheduleExceptions(companyId);
  }

  @Put('schedule-exception/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateScheduleException(
    @Param('id') id: string,
    @Body() updateScheduleExceptionDto: UpdateScheduleExceptionDto,
  ) {
    return await this.reservationsService.updateScheduleException(id, updateScheduleExceptionDto);
  }

  @Delete('schedule-exception/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteScheduleException(@Param('id') id: string) {
    await this.reservationsService.deleteScheduleException(id);
    return { message: 'Schedule exception deleted successfully' };
  }
}
