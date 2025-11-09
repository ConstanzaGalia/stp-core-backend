import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { ScheduleConfig } from 'src/entities/schedule-config.entity';
import { ScheduleException } from 'src/entities/schedule-exception.entity';
import { TimeSlotGeneration } from 'src/entities/time-slot-generation.entity';
import { RecurringReservation } from 'src/entities/recurring-reservation.entity';
import { UserPaymentSubscription, SubscriptionStatus } from 'src/entities/user-payment-subscription.entity';
import { Repository, Between } from 'typeorm';
import { CreateRecurringReservationDto, RecurringFrequency, RecurringEndType } from './dto/create-recurring-reservation.dto';
import { RecurringStatus } from 'src/entities/recurring-reservation.entity';
import { PaymentsService } from '../payments/payments.service';
import { ClassUsage, ClassUsageType } from '../../entities/class-usage.entity';

export interface RecurringGenerationSummary {
  createdReservations: number;
  skippedPastDates: string[];
  noCapacityDates: string[];
  cannotBookDates: string[];
  duplicateDates: string[];
  missingTimeSlotDates: string[];
}


@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(TimeSlot)
    private readonly timeSlotRepository: Repository<TimeSlot>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(ScheduleConfig)
    private readonly scheduleConfigRepository: Repository<ScheduleConfig>,
    @InjectRepository(ScheduleException)
    private readonly scheduleExceptionRepository: Repository<ScheduleException>,
    @InjectRepository(TimeSlotGeneration)
    private readonly timeSlotGenerationRepository: Repository<TimeSlotGeneration>,
    @InjectRepository(RecurringReservation)
    private readonly recurringReservationRepository: Repository<RecurringReservation>,
    @InjectRepository(UserPaymentSubscription)
    private readonly subscriptionRepository: Repository<UserPaymentSubscription>,
    @InjectRepository(ClassUsage)
    private readonly classUsageRepository: Repository<ClassUsage>,
    private readonly paymentsService: PaymentsService,
  ) {}

  private normalizeTimeString(time?: string): string {
    if (!time) {
      return '00:00';
    }
    const parts = time.split(':');
    const hours = parts[0] ?? '00';
    const minutes = parts[1] ?? '00';
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  /**
   * Obtener la suscripción activa de un usuario
   */
  private async getActiveSubscriptionForUser(userId: string): Promise<UserPaymentSubscription | null> {
    return await this.subscriptionRepository.findOne({
      where: { 
        user: { id: userId },
        status: SubscriptionStatus.ACTIVE
      },
      relations: ['paymentPlan', 'company']
    });
  }

  async createReservation(userId: string, timeSlotId: string): Promise<Reservation> {
    this.logger.debug(`createReservation -> userId=${userId}, timeSlotId=${timeSlotId}`);
    // 1. Validar que el usuario tenga suscripción activa
    const activeSubscription = await this.getActiveSubscriptionForUser(userId);
    if (!activeSubscription) {
      throw new BadRequestException('No tienes una suscripción activa para reservar clases');
    }
    this.logger.debug(`createReservation -> activeSubscription=${activeSubscription.id}`);

    // 2. Validar que el time slot existe
    let timeSlot = await this.timeSlotRepository.findOne({
      where: { id: timeSlotId },
      relations: ['reservations'],
    });

    if (!timeSlot) {
      this.logger.warn(`createReservation -> timeSlot not found: ${timeSlotId}`);
      throw new BadRequestException('Time slot not found');
    }

    // 3. Validar que puede reservar (plan pagado para este período, clases disponibles)
    // Pasar la fecha del turno para validar que haya un pago pagado para ese período
    const canBook = await this.paymentsService.canUserBookClass(activeSubscription.id, timeSlot.date);
    if (!canBook) {
      this.logger.warn(`createReservation -> canBookClass=false for subscription=${activeSubscription.id}`);
      throw new BadRequestException('No puedes reservar clases. Verifica que tengas el pago del mes correspondiente o clases disponibles');
    }

    // 4. Validar que el time slot esté disponible
    if (timeSlot.isAvailable()) {
      const now = new Date();
      const slotDateTime = new Date(timeSlot.date);
      const [slotHour, slotMinute] = timeSlot.startTime.split(':').map(Number);
      slotDateTime.setHours(slotHour || 0, slotMinute || 0, 0, 0);
      if (slotDateTime <= now) {
        throw new BadRequestException('No puedes reservar un turno en el pasado');
      }

      timeSlot.reservedCount += 1;
      if (!timeSlot.id) {
        timeSlot = await this.timeSlotRepository.save(timeSlot);
      }
      await this.timeSlotRepository.save(timeSlot);

      if (!timeSlot.id) {
        throw new BadRequestException('No se pudo determinar el turno para la reserva');
      }

      const reservation = this.reservationRepository.create();
      reservation.user = { id: userId } as any;
      reservation.timeSlot = timeSlot;
      reservation.timeSlotId = timeSlot.id;

      const savedReservation = await this.reservationRepository.save(reservation);
      this.logger.log(`createReservation -> reservation created id=${savedReservation.id}`);

      // 5. Registrar el uso de clase automáticamente al reservar
      try {
        await this.paymentsService.registerClassUsage(activeSubscription.id, {
          type: ClassUsageType.RESERVATION,
          usageDate: timeSlot.date,
          notes: `Reserva de turno - ${timeSlot.startTime} a ${timeSlot.endTime}`
        });
        this.logger.log(`createReservation -> class usage registered subscription=${activeSubscription.id}`);
      } catch (error) {
        // Si falla el registro de uso de clase, revertir la reserva
        await this.reservationRepository.delete({ id: savedReservation.id });
        timeSlot.reservedCount = Math.max(0, timeSlot.reservedCount - 1);
        await this.timeSlotRepository.save(timeSlot);
        this.logger.error(`createReservation -> error registering class usage: ${error?.message}`, error?.stack);
        throw error;
      }

      return savedReservation;
    } else {
      this.logger.warn(`createReservation -> timeSlot full id=${timeSlot.id}`);
      throw new BadRequestException('Time slot is full');
    }
  }

  async cancelReservation(reservationId: string, userId: string): Promise<void> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['timeSlot', 'user'],
    });

    if (!reservation) {
      throw new BadRequestException('Reservation not found');
    }

    // Verificar que el usuario sea el propietario de la reserva
    if (reservation.user.id !== userId) {
      throw new ForbiddenException('You can only cancel your own reservations');
    }

    // Verificar que la cancelación sea al menos 2 horas antes
    const timeSlotDate = new Date(reservation.timeSlot.date);
    const timeSlotTime = reservation.timeSlot.startTime;
    const [hours, minutes] = timeSlotTime.split(':').map(Number);
    timeSlotDate.setHours(hours, minutes, 0, 0);

    const now = new Date();
    const twoHoursBefore = new Date(timeSlotDate.getTime() - 2 * 60 * 60 * 1000);

    if (now >= twoHoursBefore) {
      throw new BadRequestException('Reservations can only be cancelled at least 2 hours before the time slot');
    }

    const timeSlot = reservation.timeSlot;
    timeSlot.reservedCount = Math.max(0, timeSlot.reservedCount - 1);
    await this.timeSlotRepository.save(timeSlot);
    await this.reservationRepository.remove(reservation);
  }

  async createTimeSlots(
    companyId: string,
    daysOfWeek: number[],      // Ejemplo: [1, 2, 3, 4, 5] para Lunes a Viernes
    startTime: string,         // Ejemplo: "06:00"
    endTime: string,           // Ejemplo: "21:00"
    capacity: number,          // Ejemplo: 10 alumnos
    startDate: Date,           // Fecha inicial del rango
    endDate: Date              // Fecha final del rango
  ): Promise<TimeSlot[]> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });

    if (!company) {
      throw new BadRequestException('Invalid company ID');
    }

    const timeSlots: TimeSlot[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();

      if (daysOfWeek.includes(dayOfWeek)) {
        let currentTime = new Date(`${currentDate.toISOString().split('T')[0]}T${startTime}`);
        const endTimeDate = new Date(`${currentDate.toISOString().split('T')[0]}T${endTime}`);

        while (currentTime < endTimeDate) {
          const slot = this.timeSlotRepository.create({
            date: currentDate,
            startTime: currentTime.toISOString().split('T')[1].slice(0, 5),
            endTime: new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString().split('T')[1].slice(0, 5),
            capacity: capacity,
            company: company,
          });

          timeSlots.push(slot);
          currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
        }
      }
      // Avanza al siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return await this.timeSlotRepository.save(timeSlots);
  }

  // Métodos para la configuración de horarios
  async createScheduleConfig(companyId: string, createScheduleConfigDto: any): Promise<ScheduleConfig> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    
    if (!company) {
      throw new BadRequestException('Company not found');
    }

    const result = await this.scheduleConfigRepository.insert({
      ...createScheduleConfigDto,
      company: { id: companyId },
    });

    return await this.scheduleConfigRepository.findOne({ where: { id: result.identifiers[0].id } });
  }

  async getScheduleConfigs(companyId: string): Promise<ScheduleConfig[]> {
    return this.scheduleConfigRepository.find({
      where: { company: { id: companyId } },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async updateScheduleConfig(id: string, updateScheduleConfigDto: any): Promise<ScheduleConfig> {
    const scheduleConfig = await this.scheduleConfigRepository.findOne({ where: { id } });
    
    if (!scheduleConfig) {
      throw new BadRequestException('Schedule config not found');
    }

    Object.assign(scheduleConfig, updateScheduleConfigDto);
    return await this.scheduleConfigRepository.save(scheduleConfig);
  }

  async deleteScheduleConfig(id: string): Promise<void> {
    const scheduleConfig = await this.scheduleConfigRepository.findOne({ where: { id } });
    
    if (!scheduleConfig) {
      throw new BadRequestException('Schedule config not found');
    }

    await this.scheduleConfigRepository.remove(scheduleConfig);
  }

  async generateTimeSlotsFromConfig(companyId: string, startDate: Date, endDate: Date): Promise<TimeSlot[]> {
    
    const scheduleConfigs = await this.getScheduleConfigs(companyId);
    
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    
    if (!company) {
      throw new BadRequestException('Company not found');
    }

    if (scheduleConfigs.length === 0) {
      throw new BadRequestException('No hay configuraciones de horarios para esta compañía. Primero debes configurar los horarios.');
    }

    const timeSlots: TimeSlot[] = [];
    let currentDate = new Date(startDate);
    let totalDaysProcessed = 0;
    let totalSlotsCreated = 0;     

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      
      const configForDay = scheduleConfigs.find(config => 
        config.dayOfWeek === dayOfWeek && config.isActive
      );

      if (configForDay) {
        
        // Crear fechas de tiempo para este día ajustadas a zona horaria local
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const day = currentDate.getDate();
        
        // Parsear horarios de inicio y fin
        const [startHour, startMinute] = configForDay.startTime.split(':').map(Number);
        const [endHour, endMinute] = configForDay.endTime.split(':').map(Number);
        
        // Crear fechas usando zona horaria local (no UTC)
        let currentTime = new Date(year, month, day, startHour, startMinute, 0, 0);
        const endTimeDate = new Date(year, month, day, endHour, endMinute, 0, 0);

        // Duración del turno principal (default: 60 minutos)
        const slotDuration = (configForDay.slotDurationMinutes || 60) * 60 * 1000;

        // Generar turnos principales
        while (currentTime < endTimeDate) {
          const slotEndTime = new Date(currentTime.getTime() + slotDuration);
          
          // Verificar que no exceda el horario del día
          if (slotEndTime <= endTimeDate) {
            const slot = this.timeSlotRepository.create({
              date: new Date(year, month, day), // Fecha sin hora
              startTime: currentTime.toTimeString().slice(0, 5), // HH:MM
              endTime: slotEndTime.toTimeString().slice(0, 5), // HH:MM
              capacity: configForDay.capacity,
              durationMinutes: configForDay.slotDurationMinutes || 60,
              isIntermediateSlot: false,
              company: company,
            });

            timeSlots.push(slot);
            totalSlotsCreated++;
          }
          
          currentTime = new Date(currentTime.getTime() + slotDuration);
        }

        // Generar turnos intermedios si están habilitados
        if (configForDay.allowIntermediateSlots && configForDay.intermediateCapacity) {
          // Los turnos intermedios tienen la misma duración que los principales (60 min)
          const intermediateSlotDuration = slotDuration; // Mismo que el turno principal
          
          // El offset debe ser la mitad de la duración del turno principal
          // Si el turno principal es de 60 min, el intermedio comienza a los 30 min
          const offsetTime = slotDuration / 2;
          
          let intermediateTime = new Date(year, month, day, startHour, startMinute, 0, 0);
          intermediateTime = new Date(intermediateTime.getTime() + offsetTime);

          while (intermediateTime < endTimeDate) {
            const intermediateEndTime = new Date(intermediateTime.getTime() + intermediateSlotDuration);
            
            // Verificar que no exceda el horario del día
            if (intermediateEndTime <= endTimeDate) {
              const intermediateSlot = this.timeSlotRepository.create({
                date: new Date(year, month, day), // Fecha sin hora
                startTime: intermediateTime.toTimeString().slice(0, 5), // HH:MM
                endTime: intermediateEndTime.toTimeString().slice(0, 5), // HH:MM
                capacity: configForDay.intermediateCapacity,
                durationMinutes: configForDay.slotDurationMinutes || 60, // Misma duración que principal
                isIntermediateSlot: true,
                company: company,
              });

              timeSlots.push(intermediateSlot);
              totalSlotsCreated++;
            }
            
            // Avanzar al siguiente turno intermedio (cada turno principal)
            intermediateTime = new Date(intermediateTime.getTime() + slotDuration);
          }
        }
      } else {
      }
      
      totalDaysProcessed++;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (timeSlots.length === 0) {
      throw new BadRequestException('No se pudieron generar turnos. Verifica que las configuraciones de horarios estén activas y cubran los días en el rango de fechas.');
    }

    const savedTimeSlots = await this.timeSlotRepository.save(timeSlots);
    
    // Guardar el historial de generación - extraer solo la fecha (sin hora)
    const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDateForHistory = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    const generationRecord = this.timeSlotGenerationRepository.create({
      startDate: startDateOnly,
      endDate: endDateForHistory,
      totalDays: totalDaysProcessed,
      totalTimeSlots: totalSlotsCreated,
      daysWithConfig: scheduleConfigs.filter(config => config.isActive).length,
      daysWithoutConfig: totalDaysProcessed - totalSlotsCreated,
      company: company,
    });
    
    await this.timeSlotGenerationRepository.save(generationRecord);
    
    return savedTimeSlots;
  }

  async getTimeSlots(companyId: string, startDate?: Date, endDate?: Date): Promise<TimeSlot[]> {
    const queryBuilder = this.timeSlotRepository
      .createQueryBuilder('timeSlot')
      .leftJoinAndSelect('timeSlot.company', 'company')
      .leftJoinAndSelect('timeSlot.reservations', 'reservations')
      .where('company.id = :companyId', { companyId })
      .orderBy('timeSlot.date', 'ASC')
      .addOrderBy('timeSlot.startTime', 'ASC');

    if (startDate) {
      queryBuilder.andWhere('timeSlot.date >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('timeSlot.date <= :endDate', { endDate });
    }

    return await queryBuilder.getMany();
  }

  async getAvailableTimeSlots(companyId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    const timeSlots = await this.getTimeSlots(companyId, startDate, endDate);
    
    return timeSlots.map(slot => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: slot.capacity,
      reservedCount: slot.reservations?.length || 0,
      availableSpots: slot.capacity - (slot.reservations?.length || 0),
      isAvailable: (slot.reservations?.length || 0) < slot.capacity,
      dayOfWeek: new Date(slot.date).getDay(),
      dayName: this.getDayName(new Date(slot.date).getDay()),
    }));
  }

  getDayName(dayOfWeek: number): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayOfWeek];
  }

  private formatDateToUTC(date: any): string {
    try {
      // Si es null o undefined
      if (!date) {
        return 'Fecha no disponible';
      }
      
      // Si ya es un string en formato YYYY-MM-DD, convertirlo directamente
      if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = date.split('-');
        return `${day}/${month}/${year}`;
      }
      
      // Si es un objeto Date o string que necesita conversión
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      
      // Verificar que la fecha es válida
      if (isNaN(dateObj.getTime())) {
        return 'Fecha inválida';
      }
      
      // Convertir la fecha a string en formato DD/MM/YYYY
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    } catch (error) {
      return 'Error en fecha';
    }
  }

  async getTimeSlotGenerations(companyId: string, page: number = 1, limit: number = 10): Promise<any> {
    const skip = (page - 1) * limit;
    
    // Obtener el total de registros
    const total = await this.timeSlotGenerationRepository.count({
      where: { company: { id: companyId } },
    });

    // Obtener los registros paginados
    const generations = await this.timeSlotGenerationRepository.find({
      where: { company: { id: companyId } },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Obtener todas las excepciones para el rango de fechas
    const allExceptions = await this.scheduleExceptionRepository.find({
      where: { company: { id: companyId } },
      order: { exceptionDate: 'ASC' },
    });

    const data = generations.map(generation => {
      // Filtrar excepciones que están dentro del rango de esta generación
      const exceptionsInRange = allExceptions.filter(exception => {
        const exceptionDate = new Date(exception.exceptionDate);
        const startDate = new Date(generation.startDate);
        const endDate = new Date(generation.endDate);
        return exceptionDate >= startDate && exceptionDate <= endDate;
      });

      // Calcular estadísticas de excepciones
      const totalExceptions = exceptionsInRange.length;
      const closedDays = exceptionsInRange.filter(ex => ex.isClosed).length;
      const reducedHoursDays = exceptionsInRange.filter(ex => !ex.isClosed && (ex.startTime || ex.endTime)).length;
      const capacityChanges = exceptionsInRange.filter(ex => ex.capacity > 0).length;

      return {
        id: generation.id,
        startDate: generation.startDate,
        endDate: generation.endDate,
        totalDays: generation.totalDays,
        totalTimeSlots: generation.totalTimeSlots,
        daysWithConfig: generation.daysWithConfig,
        daysWithoutConfig: generation.daysWithoutConfig,
        createdAt: generation.createdAt,
        // Información adicional calculada
        dateRange: `${this.formatDateToUTC(generation.startDate)} - ${this.formatDateToUTC(generation.endDate)}`,
        averageSlotsPerDay: generation.totalDays > 0 ? Math.round(generation.totalTimeSlots / generation.totalDays) : 0,
        successRate: generation.totalDays > 0 ? Math.round((generation.daysWithConfig / generation.totalDays) * 100) : 0,
        // Información de excepciones
        exceptions: {
          total: totalExceptions,
          closedDays,
          reducedHoursDays,
          capacityChanges,
          details: exceptionsInRange.map(exception => ({
            id: exception.id,
            date: this.formatDateToUTC(exception.exceptionDate),
            reason: exception.reason,
            isClosed: exception.isClosed,
            startTime: exception.startTime,
            endTime: exception.endTime,
            capacity: exception.capacity,
            isActive: exception.isActive,
          })),
        },
      };
    });

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      },
    };
  }

  async getTimeSlotGenerationsDetailed(companyId: string, page: number = 1, limit: number = 10): Promise<any> {
    const skip = (page - 1) * limit;
    
    // Obtener el total de registros
    const total = await this.timeSlotGenerationRepository.count({
      where: { company: { id: companyId } },
    });

    // Obtener los registros paginados
    const generations = await this.timeSlotGenerationRepository.find({
      where: { company: { id: companyId } },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Obtener todas las excepciones
    const allExceptions = await this.scheduleExceptionRepository.find({
      where: { company: { id: companyId } },
      order: { exceptionDate: 'ASC' },
    });

    // Obtener estadísticas de turnos actuales
    const currentTimeSlots = await this.timeSlotRepository.find({
      where: { company: { id: companyId } },
      relations: ['reservations'],
    });

    const data = generations.map(generation => {
      // Filtrar excepciones que están dentro del rango de esta generación
      const exceptionsInRange = allExceptions.filter(exception => {
        const exceptionDate = new Date(exception.exceptionDate);
        const startDate = new Date(generation.startDate);
        const endDate = new Date(generation.endDate);
        return exceptionDate >= startDate && exceptionDate <= endDate;
      });

      // Filtrar turnos que están dentro del rango de esta generación
      const timeSlotsInRange = currentTimeSlots.filter(slot => {
        const slotDate = new Date(slot.date);
        const startDate = new Date(generation.startDate);
        const endDate = new Date(generation.endDate);
        return slotDate >= startDate && slotDate <= endDate;
      });

      // Calcular estadísticas detalladas
      const totalExceptions = exceptionsInRange.length;
      const closedDays = exceptionsInRange.filter(ex => ex.isClosed).length;
      const reducedHoursDays = exceptionsInRange.filter(ex => !ex.isClosed && (ex.startTime || ex.endTime)).length;
      const capacityChanges = exceptionsInRange.filter(ex => ex.capacity > 0).length;

      const totalCurrentSlots = timeSlotsInRange.length;
      const totalReservations = timeSlotsInRange.reduce((sum, slot) => sum + (slot.reservations?.length || 0), 0);
      const availableSlots = timeSlotsInRange.reduce((sum, slot) => sum + (slot.capacity - (slot.reservations?.length || 0)), 0);

      return {
        id: generation.id,
        startDate: generation.startDate,
        endDate: generation.endDate,
        totalDays: generation.totalDays,
        totalTimeSlots: generation.totalTimeSlots,
        daysWithConfig: generation.daysWithConfig,
        daysWithoutConfig: generation.daysWithoutConfig,
        createdAt: generation.createdAt,
        // Información adicional calculada
        dateRange: `${this.formatDateToUTC(generation.startDate)} - ${this.formatDateToUTC(generation.endDate)}`,
        averageSlotsPerDay: generation.totalDays > 0 ? Math.round(generation.totalTimeSlots / generation.totalDays) : 0,
        successRate: generation.totalDays > 0 ? Math.round((generation.daysWithConfig / generation.totalDays) * 100) : 0,
        // Estadísticas actuales
        currentStats: {
          totalSlots: totalCurrentSlots,
          totalReservations,
          availableSlots,
          occupancyRate: totalCurrentSlots > 0 ? Math.round((totalReservations / (totalCurrentSlots * 10)) * 100) : 0, // Asumiendo capacidad promedio de 10
        },
        // Información de excepciones
        exceptions: {
          total: totalExceptions,
          closedDays,
          reducedHoursDays,
          capacityChanges,
          details: exceptionsInRange.map(exception => ({
            id: exception.id,
            date: this.formatDateToUTC(exception.exceptionDate),
            reason: exception.reason,
            isClosed: exception.isClosed,
            startTime: exception.startTime,
            endTime: exception.endTime,
            capacity: exception.capacity,
            isActive: exception.isActive,
          })),
        },
      };
    });

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      },
    };
  }

  async deleteTimeSlotGeneration(generationId: string, companyId: string): Promise<any> {
    // Verificar que la generación existe y pertenece a la compañía
    const generation = await this.timeSlotGenerationRepository.findOne({
      where: { id: generationId, company: { id: companyId } },
    });

    if (!generation) {
      throw new BadRequestException('Generación no encontrada o no pertenece a esta compañía');
    }

    // Eliminar todos los turnos generados en ese rango de fechas
    const deletedTimeSlots = await this.timeSlotRepository.delete({
      company: { id: companyId },
      date: Between(generation.startDate, generation.endDate),
    });

    // Eliminar el registro de generación
    await this.timeSlotGenerationRepository.remove(generation);

    return {
      message: 'Lote de turnos eliminado correctamente',
      deletedGeneration: {
        id: generation.id,
        dateRange: `${this.formatDateToUTC(generation.startDate)} - ${this.formatDateToUTC(generation.endDate)}`,
        totalTimeSlots: generation.totalTimeSlots,
      },
      deletedTimeSlots: deletedTimeSlots.affected || 0,
    };
  }

  async getUserReservations(userId: string): Promise<any[]> {
    const reservations = await this.reservationRepository.find({
      where: { user: { id: userId } },
      relations: ['user', 'timeSlot', 'timeSlot.company'],
      order: { id: 'DESC' },
    });

    return reservations
      .filter(reservation => reservation.timeSlot)
      .map(reservation => {
        const timeSlotDate = reservation.timeSlot?.date ? new Date(reservation.timeSlot.date) : new Date(0);
        const timeSlotTime = reservation.timeSlot?.startTime ?? '00:00';
      const [hours, minutes] = timeSlotTime.split(':').map(Number);
        timeSlotDate.setHours(hours || 0, minutes || 0, 0, 0);

      const now = new Date();
      const twoHoursBefore = new Date(timeSlotDate.getTime() - 2 * 60 * 60 * 1000);

      return {
        id: reservation.id,
          userId: reservation.user?.id,
          timeSlotId: reservation.timeSlot?.id ?? null,
          date: reservation.timeSlot?.date ?? null,
          startTime: reservation.timeSlot?.startTime ?? null,
          endTime: reservation.timeSlot?.endTime ?? null,
          companyName: reservation.timeSlot?.company?.name ?? null,
          canCancel: reservation.timeSlot ? now < twoHoursBefore : false,
          cancelDeadline: reservation.timeSlot ? twoHoursBefore : null,
        createdAt: reservation.createdAt,
      };
    });
  }

  // Métodos para gestión de excepciones de horarios
  async createScheduleException(
    companyId: string,
    createScheduleExceptionDto: any,
  ): Promise<any> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    
    if (!company) {
      throw new BadRequestException('Company not found');
    }

    // Crear la excepción
    const result = await this.scheduleExceptionRepository.insert({
      ...createScheduleExceptionDto,
      company: { id: companyId },
    });

    const exception = await this.scheduleExceptionRepository.findOne({ where: { id: result.identifiers[0].id } });

    // Aplicar la excepción a los turnos existentes
    const applicationResult = await this.applyExceptionToExistingTimeSlots(companyId, exception);

    return {
      exception,
      applicationResult,
      message: 'Excepción creada correctamente',
    };
  }

  async applyExceptionToExistingTimeSlots(companyId: string, exception: ScheduleException): Promise<any> {
    console.log(`Aplicando excepción ${exception.id} a turnos existentes para ${exception.exceptionDate}`);

    // Buscar turnos sin reservas primero (más rápido para eliminar)
    const timeSlotsToDelete = await this.timeSlotRepository.find({
      where: {
        company: { id: companyId },
        date: exception.exceptionDate,
      },
      relations: ['reservations'],
    });

    console.log(`Encontrados ${timeSlotsToDelete.length} turnos para la fecha ${exception.exceptionDate}`);

    if (timeSlotsToDelete.length === 0) {
      console.log('No hay turnos existentes para aplicar la excepción');
      return { 
        message: 'No hay turnos existentes para esta fecha',
        updatedSlots: 0,
        deletedSlots: 0,
        totalProcessed: 0,
        note: 'La excepción se guardó pero no se aplicó a ningún turno'
      };
    }

    let updatedSlots = 0;
    let deletedSlots = 0;
    let skippedSlots = 0;

    // Procesar en lotes para mejor rendimiento
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < timeSlotsToDelete.length; i += batchSize) {
      batches.push(timeSlotsToDelete.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const operations = [];

      for (const timeSlot of batch) {
        // Si el día está completamente cerrado
        if (exception.isClosed) {
          // Verificar si hay reservas
          if (timeSlot.reservations && timeSlot.reservations.length > 0) {
            console.log(`⚠️ No se puede cerrar el turno ${timeSlot.id} porque tiene ${timeSlot.reservations.length} reservas`);
            skippedSlots++;
            continue;
          }
          
          // Agregar a operaciones de eliminación
          operations.push(this.timeSlotRepository.remove(timeSlot));
          deletedSlots++;
        } else {
          // Modificar el turno según la excepción
          if (exception.startTime && exception.endTime) {
            const slotStart = timeSlot.startTime;
            const slotEnd = timeSlot.endTime;
            const exceptionStart = exception.startTime;
            const exceptionEnd = exception.endTime;

            // Si el turno está completamente fuera del horario de la excepción
            if (slotEnd <= exceptionStart || slotStart >= exceptionEnd) {
              // Verificar si hay reservas
              if (timeSlot.reservations && timeSlot.reservations.length > 0) {
                console.log(`⚠️ No se puede eliminar el turno ${timeSlot.id} porque tiene reservas`);
                skippedSlots++;
                continue;
              }
              
              // Agregar a operaciones de eliminación
              operations.push(this.timeSlotRepository.remove(timeSlot));
              deletedSlots++;
            } else {
              // Ajustar el turno al horario de la excepción
              const newStartTime = slotStart < exceptionStart ? exceptionStart : slotStart;
              const newEndTime = slotEnd > exceptionEnd ? exceptionEnd : slotEnd;
              
              // Verificar que el turno tenga duración válida
              if (newStartTime < newEndTime) {
                timeSlot.startTime = newStartTime;
                timeSlot.endTime = newEndTime;
                timeSlot.capacity = exception.capacity || timeSlot.capacity;
                
                // Agregar a operaciones de actualización
                operations.push(this.timeSlotRepository.save(timeSlot));
                updatedSlots++;
              } else {
                // Turno sin duración válida, eliminarlo si no tiene reservas
                if (!timeSlot.reservations || timeSlot.reservations.length === 0) {
                  operations.push(this.timeSlotRepository.remove(timeSlot));
                  deletedSlots++;
                } else {
                  skippedSlots++;
                }
              }
            }
          } else {
            // Solo cambiar la capacidad
            timeSlot.capacity = exception.capacity || timeSlot.capacity;
            operations.push(this.timeSlotRepository.save(timeSlot));
            updatedSlots++;
          }
        }
      }

      // Ejecutar operaciones en lote
      if (operations.length > 0) {
        await Promise.all(operations);
        console.log(`✅ Procesado lote: ${operations.length} operaciones`);
      }
    }

    console.log(`✅ Excepción aplicada: ${updatedSlots} turnos actualizados, ${deletedSlots} turnos eliminados, ${skippedSlots} turnos omitidos`);

    return {
      message: 'Excepción aplicada correctamente',
      updatedSlots,
      deletedSlots,
      skippedSlots,
      totalProcessed: timeSlotsToDelete.length,
    };
  }

  async getScheduleExceptions(companyId: string): Promise<ScheduleException[]> {
    return this.scheduleExceptionRepository.find({
      where: { company: { id: companyId } },
      order: { exceptionDate: 'ASC' },
    });
  }

  async getScheduleExceptionById(exceptionId: string): Promise<ScheduleException | null> {
    return this.scheduleExceptionRepository.findOne({
      where: { id: exceptionId },
      relations: ['company']
    });
  }

  async updateScheduleException(
    id: string,
    updateScheduleExceptionDto: any,
  ): Promise<ScheduleException> {
    const scheduleException = await this.scheduleExceptionRepository.findOne({ where: { id } });
    
    if (!scheduleException) {
      throw new BadRequestException('Schedule exception not found');
    }

    // Guardar la fecha original para aplicar la excepción
    const originalDate = scheduleException.exceptionDate;

    Object.assign(scheduleException, updateScheduleExceptionDto);
    const updatedException = await this.scheduleExceptionRepository.save(scheduleException);

    // Si la fecha cambió, aplicar la excepción a la nueva fecha
    if (originalDate !== updatedException.exceptionDate) {
      await this.applyExceptionToExistingTimeSlots(scheduleException.company.id, updatedException);
    }

    return updatedException;
  }

  async deleteScheduleException(id: string): Promise<void> {
    const scheduleException = await this.scheduleExceptionRepository.findOne({ 
      where: { id },
      relations: ['company'] // Cargar la relación company
    });
    
    if (!scheduleException) {
      throw new BadRequestException('Schedule exception not found');
    }

    // Restaurar los turnos originales antes de eliminar la excepción
    await this.restoreTimeSlotsFromException(scheduleException);

    await this.scheduleExceptionRepository.remove(scheduleException);
  }

  async restoreTimeSlotsFromException(exception: ScheduleException): Promise<any> {
    console.log(`Restaurando turnos para la fecha ${exception.exceptionDate} después de eliminar excepción`);

    // Regenerar turnos para esa fecha específica usando la configuración base
    const companyId = exception.company.id;
    const scheduleConfigs = await this.getScheduleConfigs(companyId);
    const company = await this.companyRepository.findOne({ where: { id: companyId } });

    if (!company || scheduleConfigs.length === 0) {
      console.log('No se pueden restaurar turnos: configuración no encontrada');
      return { message: 'No se pueden restaurar turnos' };
    }

    // Eliminar turnos existentes para esa fecha
    await this.timeSlotRepository.delete({
      company: { id: companyId },
      date: exception.exceptionDate,
    });

    // Regenerar turnos usando la configuración base
    const dayOfWeek = new Date(exception.exceptionDate).getDay();
    const configForDay = scheduleConfigs.find(config => 
      config.dayOfWeek === dayOfWeek && config.isActive
    );

    if (configForDay) {
      const timeSlots: TimeSlot[] = [];
      let currentTime = new Date(`${exception.exceptionDate}T${configForDay.startTime}`);
      const endTimeDate = new Date(`${exception.exceptionDate}T${configForDay.endTime}`);

      while (currentTime < endTimeDate) {
        const slot = this.timeSlotRepository.create({
          date: new Date(exception.exceptionDate),
          startTime: currentTime.toISOString().split('T')[1].slice(0, 5),
          endTime: new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString().split('T')[1].slice(0, 5),
          capacity: configForDay.capacity,
          company: company,
        });

        timeSlots.push(slot);
        currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
      }

      await this.timeSlotRepository.save(timeSlots);
      console.log(`✅ Restaurados ${timeSlots.length} turnos para ${exception.exceptionDate}`);
      
      return {
        message: 'Turnos restaurados correctamente',
        restoredSlots: timeSlots.length,
      };
    }

    return { message: 'No hay configuración para restaurar turnos' };
  }

  // Método mejorado para generar turnos considerando excepciones
  async generateTimeSlotsWithExceptions(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TimeSlot[]> {
    const scheduleConfigs = await this.getScheduleConfigs(companyId);
    const scheduleExceptions = await this.getScheduleExceptions(companyId);
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    
    if (!company) {
      throw new BadRequestException('Company not found');
    }

    const timeSlots: TimeSlot[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dateString = currentDate.toISOString().split('T')[0];
      
      // Verificar si hay una excepción para esta fecha
      const exception = scheduleExceptions.find(ex => 
        ex.exceptionDate.toISOString().split('T')[0] === dateString && ex.isActive
      );

      if (exception) {
        // Aplicar excepción
        if (!exception.isClosed && exception.startTime && exception.endTime) {
          // Horario reducido
          let currentTime = new Date(`${dateString}T${exception.startTime}`);
          const endTimeDate = new Date(`${dateString}T${exception.endTime}`);

          while (currentTime < endTimeDate) {
            const slot = this.timeSlotRepository.create({
              date: new Date(currentDate),
              startTime: currentTime.toISOString().split('T')[1].slice(0, 5),
              endTime: new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString().split('T')[1].slice(0, 5),
              capacity: exception.capacity || 5, // Capacidad reducida
              company: company,
            });

            timeSlots.push(slot);
            currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
          }
        }
        // Si isClosed es true, no se generan turnos para ese día
      } else {
        // Horario normal
        const configForDay = scheduleConfigs.find(config => 
          config.dayOfWeek === dayOfWeek && config.isActive
        );

        if (configForDay) {
          let currentTime = new Date(`${dateString}T${configForDay.startTime}`);
          const endTimeDate = new Date(`${dateString}T${configForDay.endTime}`);

          while (currentTime < endTimeDate) {
            const slot = this.timeSlotRepository.create({
              date: new Date(currentDate),
              startTime: currentTime.toISOString().split('T')[1].slice(0, 5),
              endTime: new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString().split('T')[1].slice(0, 5),
              capacity: configForDay.capacity,
              company: company,
            });

            timeSlots.push(slot);
            currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return await this.timeSlotRepository.save(timeSlots);
  }

  /**
   * Crear una reserva recurrente
   */
  async createRecurringReservation(
    userId: string,
    createRecurringDto: CreateRecurringReservationDto
  ): Promise<{ recurringReservation: RecurringReservation; generationSummary: RecurringGenerationSummary }> {
    this.logger.debug(`createRecurringReservation -> userId=${userId}, days=${createRecurringDto.daysOfWeek?.join(',')}, startTime=${createRecurringDto.startTime}`);
    const { daysOfWeek, startTime, endTime, companyId, frequency, startDate, endType, endDate, maxOccurrences, notes } = createRecurringDto;

    const normalizedStartTime = this.normalizeTimeString(startTime);
    const normalizedEndTime = this.normalizeTimeString(endTime);

    // Obtener companyId del usuario si no se proporciona
    let finalCompanyId = companyId;
    if (!finalCompanyId) {
      // Obtener la suscripción activa del usuario para obtener el companyId
      const activeSubscription = await this.getActiveSubscriptionForUser(userId);
      if (!activeSubscription) {
        throw new BadRequestException('No tienes una suscripción activa. Necesitas especificar el companyId');
      }
      finalCompanyId = activeSubscription.company.id;
    }

    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: finalCompanyId }
    });

    if (!company) {
      throw new BadRequestException('La empresa no existe');
    }

    // Valores por defecto
    const finalFrequency = frequency || RecurringFrequency.WEEKLY;
    const finalEndType = endType || RecurringEndType.NEVER;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const finalStartDate = startDate ? new Date(startDate) : today;

    // Validar fechas
    if (finalStartDate < today) {
      throw new BadRequestException('La fecha de inicio no puede ser anterior a hoy');
    }

    if (finalEndType === RecurringEndType.DATE && endDate) {
      const endDateObj = new Date(endDate);
      if (endDateObj <= finalStartDate) {
        throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
      }
    }

    // Capacidad por defecto: 1 (reserva individual)
    const capacity = 1;

    // Crear la reserva recurrente
    const recurringReservation = this.recurringReservationRepository.create({
      frequency: finalFrequency,
      daysOfWeek: daysOfWeek.join(','),
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      capacity,
      startDate: finalStartDate,
      endType: finalEndType,
      endDate: finalEndType === RecurringEndType.DATE && endDate ? new Date(endDate) : null,
      maxOccurrences: finalEndType === RecurringEndType.COUNT ? maxOccurrences : null,
      currentOccurrences: 0,
      status: RecurringStatus.ACTIVE,
      notes,
      user: { id: userId } as any,
      company: { id: finalCompanyId } as any,
    });

    const savedRecurringReservation = await this.recurringReservationRepository.save(recurringReservation);

    const generationSummary = await this.generateRecurringReservations(savedRecurringReservation.id);

    return {
      recurringReservation: savedRecurringReservation,
      generationSummary,
    };
  }

  /**
   * Generar reservas para una reserva recurrente
   */
  async generateRecurringReservations(recurringReservationId: string): Promise<RecurringGenerationSummary> {
    this.logger.debug(`generateRecurringReservations -> recurringReservationId=${recurringReservationId}`);
    const recurringReservation = await this.recurringReservationRepository.findOne({
      where: { id: recurringReservationId },
      relations: ['user', 'company']
    });

    if (!recurringReservation || recurringReservation.status !== RecurringStatus.ACTIVE) {
      this.logger.warn(`generateRecurringReservations -> reservation inactive or not found id=${recurringReservationId}`);
      return {
        createdReservations: 0,
        skippedPastDates: [],
        noCapacityDates: [],
        cannotBookDates: [],
        duplicateDates: [],
        missingTimeSlotDates: [],
      };
    }

    // Manejar daysOfWeek como string o array (TypeORM simple-array puede devolver ambos)
    let daysOfWeek: number[];
    if (typeof recurringReservation.daysOfWeek === 'string') {
      daysOfWeek = recurringReservation.daysOfWeek.split(',').map(Number);
    } else if (Array.isArray(recurringReservation.daysOfWeek)) {
      daysOfWeek = (recurringReservation.daysOfWeek as any[]).map(Number);
    } else {
      daysOfWeek = [];
    }
    const startDate = new Date(recurringReservation.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Ajustar el rango de generación según la suscripción y la reserva recurrente
    const activeSubscription = await this.getActiveSubscriptionForUser(recurringReservation.user.id);
    if (!activeSubscription) {
      this.logger.warn(`generateRecurringReservations -> no active subscription for user=${recurringReservation.user.id}`);
      throw new BadRequestException('No tienes una suscripción activa para crear reservas recurrentes');
    }

    // Ajustar el rango de generación según la suscripción y la reserva recurrente
    const periodStart = new Date(activeSubscription.periodStartDate);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(activeSubscription.periodEndDate);
    periodEnd.setHours(23, 59, 59, 999);

    let endGenerationDate = new Date(periodEnd);
    if (recurringReservation.endDate) {
      const recurrenceEnd = new Date(recurringReservation.endDate);
      recurrenceEnd.setHours(23, 59, 59, 999);
      if (recurrenceEnd.getTime() < endGenerationDate.getTime()) {
        endGenerationDate = recurrenceEnd;
      }
    }

    let remainingOccurrences = recurringReservation.maxOccurrences
      ? Math.max(recurringReservation.maxOccurrences - (recurringReservation.currentOccurrences || 0), 0)
      : Number.MAX_SAFE_INTEGER;

    if (remainingOccurrences <= 0) {
      return {
        createdReservations: 0,
        skippedPastDates: [],
        noCapacityDates: [],
        cannotBookDates: [],
        duplicateDates: [],
        missingTimeSlotDates: [],
      };
    }

    const effectiveStartTimestamp = Math.max(today.getTime(), startDate.getTime(), periodStart.getTime());
    let currentDate = new Date(effectiveStartTimestamp);
    currentDate.setHours(0, 0, 0, 0);

    if (currentDate.getTime() > endGenerationDate.getTime()) {
      return {
        createdReservations: 0,
        skippedPastDates: [],
        noCapacityDates: [],
        cannotBookDates: [],
        duplicateDates: [],
        missingTimeSlotDates: [],
      };
    }

    let remainingClassesPeriod = activeSubscription.classesRemainingThisPeriod ?? 0;
    if (remainingClassesPeriod <= 0) {
      const maxClassesPerPeriod = activeSubscription.paymentPlan?.maxClassesPerPeriod ?? 0;
      const classesUsedThisPeriod = activeSubscription.classesUsedThisPeriod ?? 0;
      if (maxClassesPerPeriod > 0 && classesUsedThisPeriod < maxClassesPerPeriod) {
        remainingClassesPeriod = maxClassesPerPeriod - classesUsedThisPeriod;
      }
    }

    if (remainingClassesPeriod <= 0) {
      this.logger.warn(`generateRecurringReservations -> no remaining classes subscription=${activeSubscription.id}`);
      return {
        createdReservations: 0,
        skippedPastDates: [],
        noCapacityDates: [],
        cannotBookDates: [],
        duplicateDates: [],
        missingTimeSlotDates: [],
      };
    }

    let generatedCount = 0;
    let lastGeneratedDate: Date | null = null;
    const skippedPastDates: string[] = [];
    const noCapacityDates: string[] = [];
    const cannotBookDates: string[] = [];
    const duplicateDates: string[] = [];
    const missingTimeSlotDates: string[] = [];

    const nowGlobal = new Date();
    nowGlobal.setSeconds(0, 0);
    const recurringStartTime = this.normalizeTimeString(recurringReservation.startTime);
    const recurringEndTime = this.normalizeTimeString(recurringReservation.endTime);

    try {
      this.logger.debug(`generateRecurringReservations -> start loop recurringId=${recurringReservationId}, remainingOccurrences=${remainingOccurrences}, remainingClasses=${remainingClassesPeriod}`);
      while (
        currentDate.getTime() <= endGenerationDate.getTime() &&
        generatedCount < 50 &&
        remainingClassesPeriod > 0 &&
        remainingOccurrences > 0
      ) {
      const dayOfWeek = currentDate.getDay();
      
        if (!daysOfWeek.includes(dayOfWeek)) {
          this.logger.verbose(`generateRecurringReservations -> skip day (not in schedule) date=${currentDate.toISOString()}`);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        if (currentDate.getTime() > periodEnd.getTime()) {
          this.logger.verbose(`generateRecurringReservations -> reached period end date=${currentDate.toISOString()}`);
          break;
        }

        const slotDate = new Date(currentDate);
        slotDate.setHours(0, 0, 0, 0);

        const slotDateTime = new Date(slotDate);
        const [startHour, startMinute] = recurringStartTime.split(':').map(Number);
        slotDateTime.setHours(startHour || 0, startMinute || 0, 0, 0);
        if (slotDateTime <= nowGlobal) {
          this.logger.verbose(`generateRecurringReservations -> skip past slot date=${slotDateTime.toISOString()}`);
          skippedPastDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Verificar que el usuario pueda reservar en esa fecha específica
        const canBook = await this.paymentsService.canUserBookClass(activeSubscription.id, slotDate);
        if (!canBook) {
          this.logger.verbose(`generateRecurringReservations -> canBook=false subscription=${activeSubscription.id} date=${slotDate.toISOString()}`);
          cannotBookDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const timeSlot = await this.timeSlotRepository.findOne({
            where: {
            date: slotDate,
              startTime: recurringStartTime,
              endTime: recurringEndTime,
              company: { id: recurringReservation.company.id }
          },
          relations: ['reservations']
        });
 
        if (!timeSlot?.id) {
          this.logger.verbose(`generateRecurringReservations -> no timeslot configured date=${slotDate.toISOString()} start=${recurringReservation.startTime}`);
          missingTimeSlotDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const existingReservation = await this.reservationRepository.findOne({
            where: {
              user: { id: recurringReservation.user.id },
            timeSlot: { id: timeSlot.id }
          }
        });

        if (existingReservation) {
          this.logger.verbose(`generateRecurringReservations -> reservation already exists timeSlot=${timeSlot.id}`);
          duplicateDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const reservedCount = timeSlot.reservedCount ?? timeSlot.reservations?.length ?? 0;
        if (reservedCount >= timeSlot.capacity) {
          this.logger.verbose(`generateRecurringReservations -> timeSlot full id=${timeSlot.id}`);
          noCapacityDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const reservation = this.reservationRepository.create({
          user: { id: recurringReservation.user.id } as any,
          timeSlot: { id: timeSlot.id } as any,
          timeSlotId: timeSlot.id,
        });

        const savedReservation = await this.reservationRepository.save(reservation);
        this.logger.log(`generateRecurringReservations -> created reservation id=${savedReservation.id} date=${slotDate.toISOString()}`);

        try {
          await this.paymentsService.registerClassUsage(activeSubscription.id, {
            type: ClassUsageType.RESERVATION,
            usageDate: slotDate,
            notes: `Reserva recurrente - ${recurringStartTime} a ${recurringEndTime}`
          });
          this.logger.log(`generateRecurringReservations -> class usage registered subscription=${activeSubscription.id}`);

          if (timeSlot) {
            timeSlot.reservedCount = reservedCount + 1;
            await this.timeSlotRepository.update({ id: timeSlot.id }, { reservedCount: timeSlot.reservedCount });
          }

          remainingClassesPeriod--;
          remainingOccurrences--;
              generatedCount++;
          lastGeneratedDate = new Date(slotDate);
        } catch (error) {
          await this.reservationRepository.delete({ id: savedReservation.id });
          this.logger.error(`generateRecurringReservations -> error registering class usage date=${slotDate.toISOString()}: ${error?.message}`, error?.stack);
        }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    await this.recurringReservationRepository.update(recurringReservationId, {
      currentOccurrences: recurringReservation.currentOccurrences + generatedCount,
        lastGeneratedDate: lastGeneratedDate ?? recurringReservation.lastGeneratedDate
    });
    this.logger.log(`generateRecurringReservations -> completed recurringId=${recurringReservationId}, generated=${generatedCount}`);
    return {
      createdReservations: generatedCount,
      skippedPastDates,
      noCapacityDates,
      cannotBookDates,
      duplicateDates,
      missingTimeSlotDates,
    };
  } catch (error) {
      this.logger.error(`generateRecurringReservations -> fatal error recurringId=${recurringReservationId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * Obtener reservas recurrentes de un usuario
   */
  async getUserRecurringReservations(userId: string): Promise<RecurringReservation[]> {
    return await this.recurringReservationRepository.find({
      where: { 
        user: { id: userId }
      },
      relations: ['company', 'user'],
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Obtener todas las reservas recurrentes de una empresa
   */
  async getCompanyRecurringReservations(companyId: string): Promise<RecurringReservation[]> {
    return await this.recurringReservationRepository.find({
      where: { 
        company: { id: companyId }
      },
      relations: ['company', 'user'],
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Cancelar una reserva recurrente y eliminar todas las reservas asociadas
   */
  async cancelRecurringReservation(recurringReservationId: string, userId: string, deleteReservations: boolean = true): Promise<{ message: string; deletedReservations: number; deletedTimeSlots: number; restoredClasses: number }> {
    const recurringReservation = await this.recurringReservationRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      },
      relations: ['company', 'user']
    });

    if (!recurringReservation) {
      throw new BadRequestException('Reserva recurrente no encontrada');
    }

    // Obtener la suscripción activa del usuario para restaurar clases
    const activeSubscription = await this.getActiveSubscriptionForUser(userId);
    if (!activeSubscription) {
      throw new BadRequestException('No tienes una suscripción activa');
    }

    let deletedReservationsCount = 0;
    let deletedTimeSlotsCount = 0;
    let restoredClassesCount = 0;

    // Si se debe eliminar las reservas asociadas
    if (deleteReservations) {
      // Obtener los días de la semana de la reserva recurrente
      let daysOfWeek: number[];
      if (typeof recurringReservation.daysOfWeek === 'string') {
        daysOfWeek = recurringReservation.daysOfWeek.split(',').map(Number);
      } else if (Array.isArray(recurringReservation.daysOfWeek)) {
        daysOfWeek = (recurringReservation.daysOfWeek as any[]).map(Number);
      } else {
        daysOfWeek = [];
      }

      // Buscar todas las reservas del usuario que coincidan con los días y horarios de la reserva recurrente
      const startDate = new Date(recurringReservation.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Buscar reservas futuras (desde hoy en adelante)
      const userReservations = await this.reservationRepository.find({
        where: {
          user: { id: userId }
        },
        relations: ['timeSlot', 'timeSlot.company']
      });

      // Filtrar reservas que coincidan con la reserva recurrente
      const reservationsToDelete = userReservations.filter(reservation => {
        if (!reservation.timeSlot) {
          return false;
        }

        const reservationDate = new Date(reservation.timeSlot.date);
        reservationDate.setHours(0, 0, 0, 0);
        
        // Verificar que la fecha sea futura o igual a la fecha de inicio
        if (reservationDate < startDate) {
          return false;
        }

        // Verificar que coincida el día de la semana
        const dayOfWeek = reservationDate.getDay();
        if (!daysOfWeek.includes(dayOfWeek)) {
          return false;
        }

        // Verificar que coincida el horario
        if (!reservation.timeSlot.startTime || !reservation.timeSlot.endTime) {
          return false;
        }

        if (reservation.timeSlot.startTime !== recurringReservation.startTime ||
            reservation.timeSlot.endTime !== recurringReservation.endTime) {
          return false;
        }

        // Verificar que sea del mismo company
        if (!reservation.timeSlot.company || reservation.timeSlot.company.id !== recurringReservation.company.id) {
          return false;
        }

        return true;
      });

      // Buscar los registros de ClassUsage asociados a estas reservas
      const reservationDates = reservationsToDelete
        .filter(r => r.timeSlot)
        .map(r => {
          const date = new Date(r.timeSlot.date);
          date.setHours(0, 0, 0, 0);
          return date;
        });

      // Buscar todos los ClassUsage del usuario para estas fechas
      const classUsagesToDelete = await this.classUsageRepository.find({
        where: {
          user: { id: userId },
          subscription: { id: activeSubscription.id },
          type: ClassUsageType.RESERVATION
        },
        relations: ['user', 'subscription']
      });

      // Filtrar los ClassUsage que coincidan con las fechas de las reservas a eliminar
      const classUsagesToRemove = classUsagesToDelete.filter(classUsage => {
        const usageDate = new Date(classUsage.usageDate);
        usageDate.setHours(0, 0, 0, 0);
        return reservationDates.some(date => {
          const dateStr = date.toISOString().split('T')[0];
          const usageDateStr = usageDate.toISOString().split('T')[0];
          return dateStr === usageDateStr;
        });
      });

      // Eliminar los registros de ClassUsage
      for (const classUsage of classUsagesToRemove) {
        await this.classUsageRepository.remove(classUsage);
        restoredClassesCount++;
      }

      // Restaurar contadores de clases en la suscripción
      if (restoredClassesCount > 0) {
        // Recargar la suscripción para obtener valores actualizados
        const updatedSubscription = await this.subscriptionRepository.findOne({
          where: { id: activeSubscription.id },
          relations: ['paymentPlan']
        });

        if (updatedSubscription) {
          const classesPerWeekLimit = updatedSubscription.paymentPlan?.classesPerWeek ?? Number.MAX_SAFE_INTEGER;
          const maxClassesPerPeriod = updatedSubscription.paymentPlan?.maxClassesPerPeriod ?? Number.MAX_SAFE_INTEGER;

          const originalWeeklyTotal = Math.max(0, (updatedSubscription.classesUsedThisWeek ?? 0) + (updatedSubscription.classesRemainingThisWeek ?? 0));
          const originalPeriodTotal = Math.max(0, (updatedSubscription.classesUsedThisPeriod ?? 0) + (updatedSubscription.classesRemainingThisPeriod ?? 0));

          // Restaurar contadores semanales
          updatedSubscription.classesUsedThisWeek = Math.max(0, (updatedSubscription.classesUsedThisWeek ?? 0) - restoredClassesCount);
          const restoredWeekRemaining = Math.min(
            classesPerWeekLimit,
            Math.max(0, (updatedSubscription.classesRemainingThisWeek ?? 0) + restoredClassesCount)
          );
          // Evitar exceder el total original semanal (si se conocía)
          updatedSubscription.classesRemainingThisWeek = originalWeeklyTotal > 0
            ? Math.min(restoredWeekRemaining, originalWeeklyTotal - updatedSubscription.classesUsedThisWeek)
            : restoredWeekRemaining;

          // Restaurar contadores del período
          updatedSubscription.classesUsedThisPeriod = Math.max(0, (updatedSubscription.classesUsedThisPeriod ?? 0) - restoredClassesCount);
          const restoredPeriodRemaining = Math.min(
            maxClassesPerPeriod,
            Math.max(0, (updatedSubscription.classesRemainingThisPeriod ?? 0) + restoredClassesCount)
          );
          updatedSubscription.classesRemainingThisPeriod = originalPeriodTotal > 0
            ? Math.min(restoredPeriodRemaining, originalPeriodTotal - updatedSubscription.classesUsedThisPeriod)
            : restoredPeriodRemaining;

          await this.subscriptionRepository.save(updatedSubscription);
        }
      }

      // Eliminar las reservas y actualizar contadores de time slots
      const timeSlotsToUpdate = new Map<string, { timeSlot: TimeSlot; count: number }>();

      for (const reservation of reservationsToDelete) {
        if (!reservation.timeSlot) {
          continue;
        }

        // Eliminar la reserva
        await this.reservationRepository.delete({ id: reservation.id });
        deletedReservationsCount++;

        // Actualizar contador del time slot
        const timeSlotId = reservation.timeSlot.id;
        if (!timeSlotsToUpdate.has(timeSlotId)) {
          timeSlotsToUpdate.set(timeSlotId, {
            timeSlot: reservation.timeSlot,
            count: 0
          });
        }
        const slotData = timeSlotsToUpdate.get(timeSlotId);
        if (slotData) {
          slotData.count++;
        }
      }

      // Actualizar contadores de time slots
      for (const [timeSlotId, slotData] of timeSlotsToUpdate) {
        if (!slotData.timeSlot) {
          continue;
        }

        slotData.timeSlot.reservedCount = Math.max(0, (slotData.timeSlot.reservedCount || 0) - slotData.count);
        await this.timeSlotRepository.save(slotData.timeSlot);

        // Si el time slot quedó vacío y fue creado por esta reserva recurrente, eliminarlo
        if (slotData.timeSlot.reservedCount === 0) {
          const slotDate = slotData.timeSlot.date ? new Date(slotData.timeSlot.date) : null;
          if (slotDate) {
            slotDate.setHours(0, 0, 0, 0);
          }
          
          // Verificar si el time slot fue creado después de la fecha de inicio de la reserva recurrente
          if (slotDate && slotDate >= startDate) {
            await this.timeSlotRepository.remove(slotData.timeSlot);
            deletedTimeSlotsCount++;
            this.logger.verbose(`cancelRecurringReservation -> timeSlot removed id=${slotData.timeSlot.id}`);
          }
        }
      }
    }

    // Eliminar la reserva recurrente (no solo cancelarla)
    await this.recurringReservationRepository.remove(recurringReservation);
    this.logger.log(`cancelRecurringReservation -> recurring removed id=${recurringReservationId}`);

    return {
      message: 'Reserva recurrente eliminada exitosamente',
      deletedReservations: deletedReservationsCount,
      deletedTimeSlots: deletedTimeSlotsCount,
      restoredClasses: restoredClassesCount
    };
  }

  /**
   * Pausar una reserva recurrente
   */
  async pauseRecurringReservation(recurringReservationId: string, userId: string): Promise<void> {
    const recurringReservation = await this.recurringReservationRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      }
    });

    if (!recurringReservation) {
      throw new BadRequestException('Reserva recurrente no encontrada');
    }

    await this.recurringReservationRepository.update(recurringReservationId, {
      status: RecurringStatus.PAUSED
    });
  }

  /**
   * Reanudar una reserva recurrente
   */
  async resumeRecurringReservation(recurringReservationId: string, userId: string): Promise<void> {
    const recurringReservation = await this.recurringReservationRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      }
    });

    if (!recurringReservation) {
      throw new BadRequestException('Reserva recurrente no encontrada');
    }

    await this.recurringReservationRepository.update(recurringReservationId, {
      status: RecurringStatus.ACTIVE
    });

    // Generar reservas pendientes
    await this.generateRecurringReservations(recurringReservationId);
  }
}
