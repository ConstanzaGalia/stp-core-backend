import { Controller, Post, Param, Delete, Body, Get, Put, UseGuards, Query, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ReservationsService, RecurringGenerationSummary } from './reservation.service';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { CreateTimeSlotsDto } from './dto/createTimeSlot.dto';
import { CreateScheduleConfigDto } from './dto/create-schedule-config.dto';
import { UpdateScheduleConfigDto } from './dto/update-schedule-config.dto';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { UpdateScheduleExceptionDto } from './dto/update-schedule-exception.dto';
import { CreateRecurringReservationDto } from './dto/create-recurring-reservation.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { RecurringReservation } from 'src/entities/recurring-reservation.entity';


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

  @Get('time-slot-generations-detailed/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getTimeSlotGenerationsDetailed(
    @Param('companyId') companyId: string,
    @Query() paginationQuery: PaginationQueryDto,
  ) {
    const { page = 1, limit = 10 } = paginationQuery;
    return this.reservationsService.getTimeSlotGenerationsDetailed(companyId, page, limit);
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

  @Post('schedule-exception-async/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async createScheduleExceptionAsync(
    @Param('companyId') companyId: string,
    @Body() createScheduleExceptionDto: CreateScheduleExceptionDto,
  ) {
    // Crear la excepción inmediatamente
    const result = await this.reservationsService.createScheduleException(companyId, createScheduleExceptionDto);
    
    // Procesar la aplicación de excepciones en segundo plano
    setImmediate(async () => {
      try {
        await this.reservationsService.applyExceptionToExistingTimeSlots(companyId, result.exception);
        console.log('✅ Excepción aplicada en segundo plano');
      } catch (error) {
        console.error('❌ Error aplicando excepción en segundo plano:', error);
      }
    });

    return {
      message: 'Excepción creada. Se está aplicando en segundo plano.',
      exception: result.exception,
      status: 'processing'
    };
  }

  @Post('apply-exception/:companyId/:exceptionId')
  @UseGuards(AuthGuard('jwt'))
  async applyExceptionToTimeSlots(
    @Param('companyId') companyId: string,
    @Param('exceptionId') exceptionId: string,
  ) {
    const exception = await this.reservationsService.getScheduleExceptionById(exceptionId);
    if (!exception) {
      throw new BadRequestException('Excepción no encontrada');
    }
    
    return await this.reservationsService.applyExceptionToExistingTimeSlots(companyId, exception);
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

  // Endpoint para crear reservas - debe ir al final para evitar conflictos de routing
  @Post(':userId/:timeSlotId')
  @UseGuards(AuthGuard('jwt'))
  async createReservation(
    @Param('userId') userId: string,
    @Param('timeSlotId') timeSlotId: string,
    @GetUser() user: User,
  ) {
    // Validar que el usuario autenticado sea el mismo que está reservando
    if (user.id !== userId) {
      throw new ForbiddenException('Solo puedes reservar para tu propia cuenta');
    }

    return this.reservationsService.createReservation(userId, timeSlotId);
  }

  // ========== ENDPOINTS PARA RESERVAS RECURRENTES ==========

  /**
   * Crear una reserva recurrente
   * POST /reservations/recurring
   */
  @Post('recurring')
  @UseGuards(AuthGuard('jwt'))
  async createRecurringReservation(
    @GetUser() user: User,
    @Body() createRecurringDto: CreateRecurringReservationDto
  ): Promise<{ recurringReservation: RecurringReservation; generationSummary: RecurringGenerationSummary }> {
    return this.reservationsService.createRecurringReservation(user.id, createRecurringDto);
  }

  /**
   * Obtener las reservas recurrentes del usuario autenticado
   * GET /reservations/recurring
   */
  @Get('recurring')
  @UseGuards(AuthGuard('jwt'))
  async getUserRecurringReservations(@GetUser() user: User): Promise<RecurringReservation[]> {
    return this.reservationsService.getUserRecurringReservations(user.id);
  }

  /**
   * Obtener todas las reservas recurrentes de una empresa
   * GET /reservations/recurring/company/:companyId
   */
  @Get('recurring/company/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getCompanyRecurringReservations(@Param('companyId') companyId: string): Promise<RecurringReservation[]> {
    return this.reservationsService.getCompanyRecurringReservations(companyId);
  }

  /**
   * Cancelar una reserva recurrente y eliminar todas las reservas asociadas
   * DELETE /reservations/recurring/:id
   */
  @Delete('recurring/:id')
  @UseGuards(AuthGuard('jwt'))
  async cancelRecurringReservation(
    @Param('id') id: string,
    @GetUser() user: User,
    @Query('deleteReservations') deleteReservations?: string
  ) {
    const shouldDelete = deleteReservations !== 'false'; // Por defecto elimina las reservas
    return await this.reservationsService.cancelRecurringReservation(id, user.id, shouldDelete);
  }

  /**
   * Pausar una reserva recurrente
   * PUT /reservations/recurring/:id/pause
   */
  @Put('recurring/:id/pause')
  @UseGuards(AuthGuard('jwt'))
  async pauseRecurringReservation(
    @Param('id') id: string,
    @GetUser() user: User
  ): Promise<{ message: string }> {
    await this.reservationsService.pauseRecurringReservation(id, user.id);
    return { message: 'Reserva recurrente pausada exitosamente' };
  }

  /**
   * Reanudar una reserva recurrente
   * PUT /reservations/recurring/:id/resume
   */
  @Put('recurring/:id/resume')
  @UseGuards(AuthGuard('jwt'))
  async resumeRecurringReservation(
    @Param('id') id: string,
    @GetUser() user: User
  ): Promise<{ message: string }> {
    await this.reservationsService.resumeRecurringReservation(id, user.id);
    return { message: 'Reserva recurrente reanudada exitosamente' };
  }
}
