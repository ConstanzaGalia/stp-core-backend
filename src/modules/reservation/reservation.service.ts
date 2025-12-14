import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { ScheduleConfig } from 'src/entities/schedule-config.entity';
import { ScheduleException } from 'src/entities/schedule-exception.entity';
import { TimeSlotGeneration } from 'src/entities/time-slot-generation.entity';
import { AthleteSchedule, ScheduleFrequency, ScheduleEndType, ScheduleStatus } from 'src/entities/athlete-schedule.entity';
import { UserPaymentSubscription, SubscriptionStatus } from 'src/entities/user-payment-subscription.entity';
import { Repository, Between, In } from 'typeorm';
import { CreateRecurringReservationDto, RecurringFrequency, RecurringEndType } from './dto/create-recurring-reservation.dto';
import { PaymentsService } from '../payments/payments.service';
import { ClassUsage, ClassUsageType } from '../../entities/class-usage.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { WaitlistReservation, WaitlistStatus } from '../../entities/waitlist-reservation.entity';
import { AvailableClass, AvailableClassReason, AvailableClassStatus } from '../../entities/available-class.entity';

export interface RecurringGenerationSummary {
  createdReservations: number;
  skippedPastDates: string[];
  noCapacityDates: string[];
  cannotBookDates: string[];
  duplicateDates: string[];
  missingTimeSlotDates: string[];
  availableClassesCreated: number;
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
    @InjectRepository(AthleteSchedule)
    private readonly athleteScheduleRepository: Repository<AthleteSchedule>,
    @InjectRepository(UserPaymentSubscription)
    private readonly subscriptionRepository: Repository<UserPaymentSubscription>,
    @InjectRepository(ClassUsage)
    private readonly classUsageRepository: Repository<ClassUsage>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(WaitlistReservation)
    private readonly waitlistRepository: Repository<WaitlistReservation>,
    @InjectRepository(AvailableClass)
    private readonly availableClassRepository: Repository<AvailableClass>,
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
   * Obtener clave de semana en formato YYYY-WW
   */
  private getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Obtener lunes de la semana
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
    const monday = new Date(d.setDate(diff));
    
    // Calcular número de semana ISO
    const startOfYear = new Date(monday.getFullYear(), 0, 1);
    const days = Math.floor((monday.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    
    return `${monday.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  /**
   * Obtener fecha de inicio de semana (lunes)
   */
  private getWeekStartDate(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Obtener fecha de fin de semana (domingo)
   */
  private getWeekEndDate(date: Date): Date {
    const monday = this.getWeekStartDate(date);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
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

      // 5. Intentar consumir una clase disponible antes de registrar uso del período
      const slotDate = new Date(timeSlot.date);
      slotDate.setHours(0, 0, 0, 0);
      
      // Buscar una clase disponible válida
      const availableClasses = await this.getUserAvailableClasses(userId);
      const validAvailableClass = availableClasses.find(ac => {
        const expiresAt = new Date(ac.expiresAt);
        expiresAt.setHours(0, 0, 0, 0);
        return ac.status === AvailableClassStatus.AVAILABLE && 
               expiresAt >= slotDate &&
               ac.subscription?.id === activeSubscription.id;
      });

      if (validAvailableClass) {
        // Consumir la clase disponible
        try {
          validAvailableClass.status = AvailableClassStatus.USED;
          validAvailableClass.usedAt = new Date();
          validAvailableClass.reservation = savedReservation;
          await this.availableClassRepository.save(validAvailableClass);
          
          // Vincular la reserva con la clase disponible
          savedReservation.availableClass = validAvailableClass;
          await this.reservationRepository.save(savedReservation);
          
          this.logger.log(`createReservation -> used available class id=${validAvailableClass.id} instead of period class`);
          // NO registrar uso de clase del período, ya que se usó una clase disponible
          return savedReservation;
        } catch (error) {
          this.logger.error(`createReservation -> error consuming available class: ${error?.message}`, error?.stack);
          // Si falla, continuar con el registro normal de uso de clase
        }
      }

      // 6. Si no hay clase disponible, registrar el uso de clase del período automáticamente al reservar
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
      // Si no hay cupo disponible, agregar a lista de espera
      this.logger.warn(`createReservation -> timeSlot full id=${timeSlot.id}, adding to waitlist`);
      
      // Verificar si ya existe una entrada en lista de espera para este usuario y TimeSlot
      const existingWaitlist = await this.waitlistRepository.findOne({
        where: {
          user: { id: userId },
          timeSlot: { id: timeSlotId },
          status: WaitlistStatus.PENDING
        }
      });

      if (existingWaitlist) {
        throw new BadRequestException('Ya estás en la lista de espera para este horario');
      }

      // Crear entrada en lista de espera
      const waitlistEntry = this.waitlistRepository.create({
        user: { id: userId } as any,
        timeSlot: { id: timeSlotId } as any,
        userId,
        timeSlotId,
        status: WaitlistStatus.PENDING
      });

      await this.waitlistRepository.save(waitlistEntry);
      this.logger.log(`createReservation -> waitlist entry created for user=${userId}, timeSlot=${timeSlotId}`);

      throw new BadRequestException('No hay cupo disponible en este horario. Has sido agregado a la lista de espera.');
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
    
    // Si había asistencia marcada, también decrementar attendedCount
    if (reservation.attendanceStatus === true) {
      timeSlot.attendedCount = Math.max(0, (timeSlot.attendedCount || 0) - 1);
    }
    
    await this.timeSlotRepository.save(timeSlot);
    await this.reservationRepository.remove(reservation);

    // Procesar lista de espera después de cancelar la reserva
    try {
      const waitlistResult = await this.processWaitlistForTimeSlot(timeSlot.id);
      if (waitlistResult.createdReservations > 0) {
        this.logger.log(`cancelReservation -> processed waitlist: ${waitlistResult.createdReservations} reservations created from waitlist`);
      }
      if (waitlistResult.errors.length > 0) {
        this.logger.warn(`cancelReservation -> waitlist processing errors: ${waitlistResult.errors.join('; ')}`);
      }
    } catch (error) {
      // No fallar la cancelación si hay error procesando lista de espera
      this.logger.error(`cancelReservation -> error processing waitlist: ${error?.message}`, error?.stack);
    }
  }

  /**
   * Validar si se puede modificar una reserva
   * Reglas:
   * - 2 horas de anticipación antes del horario
   * - Si newTimeSlotId está presente, validar que esté en la misma semana
   * - Si tiene plan de 3x semana, no puede tener más de 3 reservas en la semana
   */
  async canModifyReservation(
    reservationId: string,
    userId: string,
    newTimeSlotId?: string
  ): Promise<{ canModify: boolean; reason?: string; canRecover?: boolean }> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['timeSlot', 'user', 'timeSlot.company']
    });

    if (!reservation) {
      throw new BadRequestException('Reserva no encontrada');
    }

    if (reservation.user.id !== userId) {
      throw new ForbiddenException('Solo puedes modificar tus propias reservas');
    }

    const timeSlot = reservation.timeSlot;
    const timeSlotDate = new Date(timeSlot.date);
    const [hours, minutes] = timeSlot.startTime.split(':').map(Number);
    timeSlotDate.setHours(hours || 0, minutes || 0, 0, 0);

    const now = new Date();
    const oneHourBefore = new Date(timeSlotDate.getTime() - 1 * 60 * 60 * 1000);

    // Validar anticipación de 1 hora
    if (now >= oneHourBefore) {
      return {
        canModify: false,
        reason: 'Solo puedes modificar tu reserva con al menos 1 hora de anticipación',
      };
    }

    // Si se está cambiando a otro horario, validar recuperación semanal
    if (newTimeSlotId) {
      const activeSubscription = await this.getActiveSubscriptionForUser(userId);
      if (!activeSubscription) {
        return {
          canModify: false,
          reason: 'No tienes una suscripción activa',
        };
      }

      const paymentPlan = activeSubscription.paymentPlan;
      const classesPerWeek = paymentPlan?.classesPerWeek || 0;

      // Obtener la semana actual (lunes a domingo)
      const weekStart = this.getWeekStartDate(timeSlotDate);
      const weekEnd = this.getWeekEndDate(timeSlotDate);

      // Contar reservas de esta semana excluyendo la actual
      const weekReservations = await this.reservationRepository.find({
        where: {
          user: { id: userId },
          timeSlot: {
            date: Between(weekStart, weekEnd),
          },
        },
        relations: ['timeSlot'],
      });

      const reservationsThisWeek = weekReservations.filter((r) => r.id !== reservationId).length;

      // Validar que el nuevo time slot esté en la misma semana
      const newTimeSlot = await this.timeSlotRepository.findOne({
        where: { id: newTimeSlotId },
      });

      if (!newTimeSlot) {
        return {
          canModify: false,
          reason: 'El nuevo horario no existe',
        };
      }

      const newTimeSlotDate = new Date(newTimeSlot.date);
      if (newTimeSlotDate < weekStart || newTimeSlotDate > weekEnd) {
        return {
          canModify: true,
          canRecover: false,
          reason: 'Solo puedes recuperar clases dentro de la misma semana',
        };
      }

      // Si tiene plan de 3 días y ya tiene 3 reservas esta semana, no puede recuperar
      if (classesPerWeek === 3 && reservationsThisWeek >= 3) {
        return {
          canModify: true,
          canRecover: false,
          reason: 'Ya has usado todas tus clases de esta semana. Solo puedes recuperar clases dentro de la misma semana.',
        };
      }
    }

    return {
      canModify: true,
      canRecover: true,
    };
  }

  /**
   * Modificar reserva (cambiar horario del día)
   */
  async modifyReservation(
    reservationId: string,
    userId: string,
    newTimeSlotId: string
  ): Promise<Reservation> {
    const validation = await this.canModifyReservation(reservationId, userId, newTimeSlotId);

    if (!validation.canModify) {
      throw new BadRequestException(validation.reason || 'No se puede modificar la reserva');
    }

    if (validation.canRecover === false) {
      throw new BadRequestException(validation.reason || 'No se puede recuperar la clase');
    }

    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['timeSlot', 'user'],
    });

    if (!reservation) {
      throw new BadRequestException('Reserva no encontrada');
    }

    const newTimeSlot = await this.timeSlotRepository.findOne({
      where: { id: newTimeSlotId },
      relations: ['reservations'],
    });

    if (!newTimeSlot) {
      throw new BadRequestException('Nuevo horario no encontrado');
    }

    // Validar disponibilidad del nuevo horario
    if (!newTimeSlot.isAvailable()) {
      throw new BadRequestException('El nuevo horario no tiene disponibilidad');
    }

    const oldTimeSlot = reservation.timeSlot;

    // Actualizar reserva
    reservation.timeSlot = newTimeSlot;
    reservation.timeSlotId = newTimeSlot.id;

    // Actualizar contadores
    oldTimeSlot.reservedCount = Math.max(0, (oldTimeSlot.reservedCount || 0) - 1);
    newTimeSlot.reservedCount = (newTimeSlot.reservedCount || 0) + 1;

    await this.timeSlotRepository.save([oldTimeSlot, newTimeSlot]);
    const updatedReservation = await this.reservationRepository.save(reservation);

    this.logger.log(
      `modifyReservation -> reservation ${reservationId} modified from ${oldTimeSlot.id} to ${newTimeSlot.id}`
    );

    return updatedReservation;
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
    
    // Calcular estadísticas de asistencia para cada TimeSlot
    const slotsWithStats = await Promise.all(timeSlots.map(async (slot) => {
      const stats = await this.getAttendanceStats(slot.id);
      const reservedCount = slot.reservedCount ?? (slot.reservations?.length || 0);
      return {
        id: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        reservedCount,
        attendedCount: slot.attendedCount || 0,
        availableSpots: slot.capacity - reservedCount,
        isAvailable: reservedCount < slot.capacity,
        dayOfWeek: new Date(slot.date).getDay(),
        dayName: this.getDayName(new Date(slot.date).getDay()),
        attendanceStats: stats
      };
    }));
    
    return slotsWithStats;
  }

  getDayName(dayOfWeek: number): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayOfWeek];
  }

  /**
   * Obtener todos los time slots de un día específico con las reservas y alumnos para la vista de administración
   * @param companyId ID de la empresa
   * @param date Fecha para la cual obtener los time slots (YYYY-MM-DD)
   * @returns Array de time slots con información de reservas y alumnos
   */
  async getDailyReservationsForAdmin(companyId: string, date: Date): Promise<any[]> {
    // Obtener año, mes y día directamente de la fecha (ya viene parseada correctamente del controller)
    // Usar getFullYear(), getMonth(), getDate() que devuelven valores en hora local
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed (0 = Enero, 11 = Diciembre)
    const day = date.getDate();
    
    // Crear string de fecha para comparación en PostgreSQL (formato YYYY-MM-DD)
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Buscar todos los time slots para esa fecha usando DATE() de PostgreSQL
    // Esto compara solo la parte de fecha, ignorando hora y zona horaria
    const timeSlots = await this.timeSlotRepository
      .createQueryBuilder('timeSlot')
      .leftJoinAndSelect('timeSlot.company', 'company')
      .where('company.id = :companyId', { companyId })
      .andWhere(`DATE(timeSlot.date) = DATE(:dateString)`, { dateString })
      .orderBy('timeSlot.startTime', 'ASC')
      .getMany();

    // Obtener todos los IDs de time slots
    const timeSlotIds = timeSlots.map(ts => ts.id);

    // Cargar todas las reservas para estos time slots con sus usuarios usando query builder
    // Esto asegura que las relaciones se carguen correctamente
    // Usamos leftJoin para traer todas las reservas, incluso si el usuario está eliminado
    // Luego filtraremos en JavaScript
    let reservationsWithUsers: Reservation[] = [];
    if (timeSlotIds.length > 0) {
      reservationsWithUsers = await this.reservationRepository
        .createQueryBuilder('reservation')
        .leftJoinAndSelect('reservation.user', 'user')
        .leftJoinAndSelect('reservation.timeSlot', 'timeSlot')
        .where('reservation.timeSlotId IN (:...timeSlotIds)', { timeSlotIds })
        .getMany();
    }

    // Crear un mapa de timeSlotId -> reservas para acceso rápido
    const reservationsByTimeSlot = new Map<string, Reservation[]>();
    reservationsWithUsers.forEach(reservation => {
      if (!reservationsByTimeSlot.has(reservation.timeSlotId)) {
        reservationsByTimeSlot.set(reservation.timeSlotId, []);
      }
      reservationsByTimeSlot.get(reservation.timeSlotId)!.push(reservation);
    });

    // Log útil para monitoreo en producción
    const totalReservations = reservationsWithUsers.length;
    const totalStudents = reservationsWithUsers.filter(r => r.user && r.user.deletedAt === null).length;
    this.logger.log(`[getDailyReservationsForAdmin] Company: ${companyId}, Date: ${dateString}, TimeSlots: ${timeSlots.length}, Reservations: ${totalReservations}, Students: ${totalStudents}`);

    // Obtener lista de espera para todos los TimeSlots
    const waitlistCounts = new Map<string, number>();
    if (timeSlotIds.length > 0) {
      const waitlistEntries = await this.waitlistRepository.find({
        where: {
          timeSlot: { id: In(timeSlotIds) },
          status: WaitlistStatus.PENDING
        }
      });
      waitlistEntries.forEach(entry => {
        const count = waitlistCounts.get(entry.timeSlotId) || 0;
        waitlistCounts.set(entry.timeSlotId, count + 1);
      });
    }

    // Formatear la respuesta
    return Promise.all(timeSlots.map(async (timeSlot) => {
      const reservations = reservationsByTimeSlot.get(timeSlot.id) || [];
      
      // Filtrar reservas que tienen usuario válido (no eliminado y no null)
      const validReservations = reservations.filter(reservation => {
        if (!reservation || !reservation.user) {
          return false;
        }
        // Verificar que el usuario no esté eliminado (deletedAt debe ser null o undefined)
        return reservation.user.deletedAt === null || reservation.user.deletedAt === undefined;
      });
      
      // Calcular estadísticas de asistencia
      const stats = await this.getAttendanceStats(timeSlot.id);
      const reservedCount = timeSlot.reservedCount || validReservations.length;
      
      return {
        id: timeSlot.id,
        date: timeSlot.date,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        capacity: timeSlot.capacity,
        reservedCount,
        attendedCount: timeSlot.attendedCount || 0,
        availableSpots: timeSlot.capacity - reservedCount,
        waitlistCount: waitlistCounts.get(timeSlot.id) || 0,
        durationMinutes: timeSlot.durationMinutes || 60,
        isIntermediateSlot: timeSlot.isIntermediateSlot || false,
        attendanceStats: stats,
        students: validReservations.map(reservation => {
          const user = reservation.user;
          if (!user) {
            return null;
          }
          
          return {
            id: user.id,
            reservationId: reservation.id,
            name: user.name || '',
            lastName: user.lastName || '',
            fullName: `${user.name || ''} ${user.lastName || ''}`.trim() || 'Usuario sin nombre',
            email: user.email || '',
            createdAt: reservation.createdAt,
            attendanceStatus: reservation.attendanceStatus, // true = presente, false = ausente, null = sin marcar
            // Campos adicionales que podrían ser útiles
            imageProfile: user.imageProfile || null,
          };
        }).filter(student => student !== null), // Eliminar cualquier estudiante null
        // Información del entrenador (por ahora null, se puede agregar después)
        trainer: null,
        trainerName: null,
      };
    }));
  }

  /**
   * Actualizar el estado de asistencia de una reserva
   * @param reservationId ID de la reserva
   * @param attendanceStatus Estado de asistencia (true = presente, false = ausente, null = sin marcar)
   * @returns Reserva actualizada
   */
  async updateAttendance(reservationId: string, attendanceStatus: boolean | null): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['user', 'timeSlot'],
    });

    if (!reservation) {
      throw new BadRequestException('Reserva no encontrada');
    }

    const timeSlot = await this.timeSlotRepository.findOne({
      where: { id: reservation.timeSlotId },
    });

    if (!timeSlot) {
      throw new BadRequestException('Time slot no encontrado');
    }

    // Guardar el estado anterior para calcular el cambio
    const previousStatus = reservation.attendanceStatus;
    reservation.attendanceStatus = attendanceStatus;
    const updatedReservation = await this.reservationRepository.save(reservation);

    // Actualizar attendedCount del TimeSlot
    let attendedCountChange = 0;
    if (previousStatus !== true && attendanceStatus === true) {
      // Cambió a presente: incrementar
      attendedCountChange = 1;
    } else if (previousStatus === true && attendanceStatus !== true) {
      // Cambió de presente a ausente o sin marcar: decrementar
      attendedCountChange = -1;
    }

    if (attendedCountChange !== 0) {
      const newAttendedCount = Math.max(0, (timeSlot.attendedCount || 0) + attendedCountChange);
      // Validar que attendedCount nunca sea mayor que reservedCount
      const maxAttendedCount = Math.min(newAttendedCount, timeSlot.reservedCount || 0);
      timeSlot.attendedCount = maxAttendedCount;
      await this.timeSlotRepository.save(timeSlot);
      this.logger.log(`[updateAttendance] TimeSlot ${timeSlot.id} attendedCount updated: ${timeSlot.attendedCount - attendedCountChange} -> ${maxAttendedCount}`);
    }

    this.logger.log(`[updateAttendance] Reservation ${reservationId} updated: attendanceStatus=${attendanceStatus}`);

    return updatedReservation;
  }

  /**
   * Calcular estadísticas de asistencia para un TimeSlot
   */
  async getAttendanceStats(timeSlotId: string): Promise<{
    totalReservations: number;
    attendedCount: number;
    absentCount: number;
    notMarkedCount: number;
  }> {
    const reservations = await this.reservationRepository.find({
      where: { timeSlotId },
    });

    const stats = {
      totalReservations: reservations.length,
      attendedCount: reservations.filter(r => r.attendanceStatus === true).length,
      absentCount: reservations.filter(r => r.attendanceStatus === false).length,
      notMarkedCount: reservations.filter(r => r.attendanceStatus === null).length,
    };

    return stats;
  }

  /**
   * Procesar lista de espera para un TimeSlot cuando se libera un cupo
   */
  async processWaitlistForTimeSlot(timeSlotId: string): Promise<{ createdReservations: number; errors: string[] }> {
    const timeSlot = await this.timeSlotRepository.findOne({
      where: { id: timeSlotId },
    });

    if (!timeSlot) {
      return { createdReservations: 0, errors: ['TimeSlot no encontrado'] };
    }

    // Si el TimeSlot está lleno, no procesar lista de espera
    if (timeSlot.reservedCount >= timeSlot.capacity) {
      return { createdReservations: 0, errors: [] };
    }

    const createdReservations: number[] = [];
    const errors: string[] = [];

    // Buscar primera entrada pendiente en lista de espera para este TimeSlot (FIFO)
    const waitlistEntries = await this.waitlistRepository.find({
      where: {
        timeSlot: { id: timeSlotId },
        status: WaitlistStatus.PENDING
      },
      relations: ['user', 'timeSlot'],
      order: { createdAt: 'ASC' } // Primero en entrar, primero en salir
    });

    // Procesar hasta llenar los cupos disponibles
    const availableSpots = timeSlot.capacity - timeSlot.reservedCount;
    const entriesToProcess = waitlistEntries.slice(0, availableSpots);

    for (const waitlistEntry of entriesToProcess) {
      try {
        // Intentar crear la reserva
        const reservation = await this.createReservation(waitlistEntry.userId, timeSlotId);
        
        // Si tiene éxito, marcar waitlist como notified y eliminar
        waitlistEntry.status = WaitlistStatus.NOTIFIED;
        waitlistEntry.notifiedAt = new Date();
        await this.waitlistRepository.save(waitlistEntry);
        
        // Eliminar la entrada de lista de espera después de crear la reserva
        await this.waitlistRepository.remove(waitlistEntry);
        
        createdReservations.push(1);
        this.logger.log(`processWaitlistForTimeSlot -> reservation created from waitlist for user=${waitlistEntry.userId}, timeSlot=${timeSlotId}`);
      } catch (error) {
        const errorMsg = `Error procesando lista de espera para usuario ${waitlistEntry.userId}: ${error?.message}`;
        this.logger.error(`processWaitlistForTimeSlot -> ${errorMsg}`, error?.stack);
        errors.push(errorMsg);
        
        // Si falla, cancelar la entrada de lista de espera
        waitlistEntry.status = WaitlistStatus.CANCELLED;
        await this.waitlistRepository.save(waitlistEntry);
      }
    }

    return {
      createdReservations: createdReservations.length,
      errors
    };
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
    });

    const now = new Date();

    const upcoming = reservations
      .filter(reservation => {
        if (!reservation.timeSlot || !reservation.timeSlot.date) {
          return false;
        }
        const startDateTime = new Date(reservation.timeSlot.date);
        const [hour, minute] = (reservation.timeSlot.startTime ?? '00:00').split(':').map(Number);
        startDateTime.setHours(hour || 0, minute || 0, 0, 0);
        return startDateTime >= now;
      })
      .sort((a, b) => {
        const dateA = new Date(a.timeSlot.date);
        const dateB = new Date(b.timeSlot.date);
        const [hourA, minuteA] = (a.timeSlot.startTime ?? '00:00').split(':').map(Number);
        const [hourB, minuteB] = (b.timeSlot.startTime ?? '00:00').split(':').map(Number);
        dateA.setHours(hourA || 0, minuteA || 0, 0, 0);
        dateB.setHours(hourB || 0, minuteB || 0, 0, 0);
        return dateA.getTime() - dateB.getTime();
      });

    return upcoming.map(reservation => {
      const timeSlotDate = new Date(reservation.timeSlot.date);
      const [hours, minutes] = (reservation.timeSlot.startTime ?? '00:00').split(':').map(Number);
      timeSlotDate.setHours(hours || 0, minutes || 0, 0, 0);

      const twoHoursBefore = new Date(timeSlotDate.getTime() - 2 * 60 * 60 * 1000);

      return {
        id: reservation.id,
        userId: reservation.user.id,
        timeSlotId: reservation.timeSlot.id,
        date: reservation.timeSlot.date,
        startTime: reservation.timeSlot.startTime,
        endTime: reservation.timeSlot.endTime,
        companyName: reservation.timeSlot.company?.name ?? null,
        canCancel: new Date() < twoHoursBefore,
        cancelDeadline: twoHoursBefore,
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
  ): Promise<{ recurringReservation: AthleteSchedule; generationSummary: RecurringGenerationSummary }> {
    this.logger.debug(`createRecurringReservation -> userId=${userId}, days=${createRecurringDto.daysOfWeek?.join(',')}, startTime=${createRecurringDto.startTime}`);
    const { daysOfWeek, startTime, endTime, companyId, frequency, startDate, endType, endDate, maxOccurrences, notes } = createRecurringDto;

    const normalizedStartTime = this.normalizeTimeString(startTime);
    const normalizedEndTime = this.normalizeTimeString(endTime);

    // Obtener companyId del usuario si no se proporciona
    let finalCompanyId = companyId;
    let activeSubscription: UserPaymentSubscription | null = null;
    const isAdminCreating = !!companyId; // Si companyId está presente, es un admin creando para otro usuario
    
    if (!finalCompanyId) {
      // Obtener la suscripción activa del usuario para obtener el companyId
      activeSubscription = await this.getActiveSubscriptionForUser(userId);
      if (!activeSubscription) {
        throw new BadRequestException('No tienes una suscripción activa. Necesitas especificar el companyId');
      }
      finalCompanyId = activeSubscription.company.id;
    } else {
      // Si companyId está presente, intentar obtener la suscripción pero no es obligatoria
      // (puede que el admin esté creando reservas para un usuario que aún no tiene suscripción activa)
      activeSubscription = await this.getActiveSubscriptionForUser(userId);
    }

    // Verificar que la empresa existe
    const company = await this.companyRepository.findOne({
      where: { id: finalCompanyId }
    });

    if (!company) {
      throw new BadRequestException('La empresa no existe');
    }

    // Valores por defecto - mapear desde DTO a entidad
    const finalFrequency = (frequency ? frequency as unknown as ScheduleFrequency : ScheduleFrequency.WEEKLY);
    const finalEndType = (endType ? endType as unknown as ScheduleEndType : ScheduleEndType.NEVER);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const finalStartDate = startDate ? new Date(startDate) : today;

    // Validar fechas
    if (finalStartDate < today) {
      throw new BadRequestException('La fecha de inicio no puede ser anterior a hoy');
    }

    if (finalEndType === ScheduleEndType.DATE && endDate) {
      const endDateObj = new Date(endDate);
      if (endDateObj <= finalStartDate) {
        throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
      }
    }

    // Capacidad por defecto: 1 (reserva individual)
    const capacity = 1;

    // Crear la reserva recurrente
    const athleteSchedule = this.athleteScheduleRepository.create({
      frequency: finalFrequency,
      daysOfWeek: daysOfWeek.join(','),
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      capacity,
      startDate: finalStartDate,
      endType: finalEndType,
      endDate: finalEndType === ScheduleEndType.DATE && endDate ? new Date(endDate) : null,
      maxOccurrences: finalEndType === ScheduleEndType.COUNT ? maxOccurrences : null,
      currentOccurrences: 0,
      status: ScheduleStatus.ACTIVE,
      notes,
      user: { id: userId } as any,
      company: { id: finalCompanyId } as any,
    });

    const savedAthleteSchedule = await this.athleteScheduleRepository.save(athleteSchedule);

    const generationSummary = await this.generateRecurringReservations(savedAthleteSchedule.id);

    return {
      recurringReservation: savedAthleteSchedule,
      generationSummary,
    };
  }

  /**
   * Generar reservas para una reserva recurrente
   * @param customStartDate Fecha de inicio personalizada (opcional, para pagos)
   * @param customEndDate Fecha de fin personalizada (opcional, para pagos)
   * @param paymentId ID del pago que generó estas reservas (opcional)
   * @param periodEndDate Fecha de vencimiento del período (opcional)
   */
  async generateRecurringReservations(
    recurringReservationId: string,
    customStartDate?: Date,
    customEndDate?: Date,
    paymentId?: string,
    periodEndDate?: Date
  ): Promise<RecurringGenerationSummary> {
    this.logger.debug(`generateRecurringReservations -> recurringReservationId=${recurringReservationId}`);
    const athleteSchedule = await this.athleteScheduleRepository.findOne({
      where: { id: recurringReservationId },
      relations: ['user', 'company']
    });

    if (!athleteSchedule || athleteSchedule.status !== ScheduleStatus.ACTIVE) {
      this.logger.warn(`generateRecurringReservations -> reservation inactive or not found id=${recurringReservationId}`);
      return {
        createdReservations: 0,
        skippedPastDates: [],
        noCapacityDates: [],
        cannotBookDates: [],
        duplicateDates: [],
        missingTimeSlotDates: [],
        availableClassesCreated: 0,
      };
    }

    // Manejar daysOfWeek como string o array (TypeORM simple-array puede devolver ambos)
    let daysOfWeek: number[];
    if (typeof athleteSchedule.daysOfWeek === 'string') {
      daysOfWeek = athleteSchedule.daysOfWeek.split(',').map(Number);
    } else if (Array.isArray(athleteSchedule.daysOfWeek)) {
      daysOfWeek = (athleteSchedule.daysOfWeek as any[]).map(Number);
    } else {
      daysOfWeek = [];
    }
    const startDate = new Date(athleteSchedule.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Ajustar el rango de generación según la suscripción y la reserva recurrente
    const activeSubscription = await this.getActiveSubscriptionForUser(athleteSchedule.user.id);
    if (!activeSubscription) {
      this.logger.warn(`generateRecurringReservations -> no active subscription for user=${athleteSchedule.user.id}`);
      throw new BadRequestException('No tienes una suscripción activa para crear reservas recurrentes');
    }

    // Ajustar el rango de generación según la suscripción y la reserva recurrente
    // Si se pasan fechas personalizadas (desde pago), usarlas; sino usar las de la suscripción
    let periodStart: Date;
    let periodEnd: Date;
    
    if (customStartDate && customEndDate) {
      // Usar fechas del período de pago (fecha de pago a fecha de pago + 31 días)
      periodStart = new Date(customStartDate);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(customEndDate);
      periodEnd.setHours(23, 59, 59, 999);
      this.logger.log(`generateRecurringReservations -> using custom dates: start=${periodStart.toISOString()}, end=${periodEnd.toISOString()}`);
    } else {
      // Usar fechas del período de la suscripción
      periodStart = new Date(activeSubscription.periodStartDate);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(activeSubscription.periodEndDate);
      periodEnd.setHours(23, 59, 59, 999);
    }

    let endGenerationDate = new Date(periodEnd);
    if (athleteSchedule.endDate) {
      const recurrenceEnd = new Date(athleteSchedule.endDate);
      recurrenceEnd.setHours(23, 59, 59, 999);
      if (recurrenceEnd.getTime() < endGenerationDate.getTime()) {
        endGenerationDate = recurrenceEnd;
      }
    }

    let remainingOccurrences = athleteSchedule.maxOccurrences
      ? Math.max(athleteSchedule.maxOccurrences - (athleteSchedule.currentOccurrences || 0), 0)
      : Number.MAX_SAFE_INTEGER;

    if (remainingOccurrences <= 0) {
      return {
        createdReservations: 0,
        skippedPastDates: [],
        noCapacityDates: [],
        cannotBookDates: [],
        duplicateDates: [],
        missingTimeSlotDates: [],
        availableClassesCreated: 0,
      };
    }

    // Si se están usando fechas personalizadas (desde pago), usar periodStart directamente
    // Si no, usar la lógica normal que respeta lastGeneratedDate
    let effectiveStartDate: Date;
    if (customStartDate && customEndDate) {
      // Para pagos, siempre empezar desde la fecha de pago (periodStart)
      effectiveStartDate = periodStart;
      this.logger.log(`generateRecurringReservations -> using payment start date: ${effectiveStartDate.toISOString()}`);
    } else {
      // Para generación normal, respetar lastGeneratedDate si existe
      effectiveStartDate = startDate;
      if (athleteSchedule.lastGeneratedDate) {
        const lastGenerated = new Date(athleteSchedule.lastGeneratedDate);
        lastGenerated.setDate(lastGenerated.getDate() + 1);
        lastGenerated.setHours(0, 0, 0, 0);
        effectiveStartDate = lastGenerated;
      }
    }

    const effectiveStartTimestamp = Math.max(today.getTime(), effectiveStartDate.getTime(), periodStart.getTime());
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
        availableClassesCreated: 0,
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
        availableClassesCreated: 0,
      };
    }

    let generatedCount = 0;
    let availableClassesCreated = 0;
    let lastGeneratedDate: Date | null = null;
    const skippedPastDates: string[] = [];
    const noCapacityDates: string[] = [];
    const cannotBookDates: string[] = [];
    const duplicateDates: string[] = [];
    const missingTimeSlotDates: string[] = [];
    
    // OPTIMIZACIÓN: Agrupar clases disponibles y time slots para batch save
    const availableClassesToCreate: AvailableClass[] = [];
    // Usar Map para contar correctamente las reservas por timeSlot (evitar problemas con múltiples reservas al mismo slot)
    const timeSlotsReservationCount = new Map<string, number>();
    
    // OPTIMIZACIÓN: Agrupar ClassUsage para batch save y actualizar contadores al final
    const classUsagesToCreate: any[] = [];
    let totalClassesToRegister = 0;

    const nowGlobal = new Date();
    nowGlobal.setSeconds(0, 0);
    const recurringStartTime = this.normalizeTimeString(athleteSchedule.startTime);
    const recurringEndTime = this.normalizeTimeString(athleteSchedule.endTime);

    // Contador semanal para respetar classesPerWeek
    const weeklyReservationCount = new Map<string, number>();
    const classesPerWeek = activeSubscription.paymentPlan?.classesPerWeek ?? 0;

    // OPTIMIZACIÓN: Pre-cargar datos fuera del loop
    // 1. Cargar configuraciones de horarios una sola vez
    const scheduleConfigs = await this.getScheduleConfigs(athleteSchedule.company.id);
    const scheduleConfigsByDay = new Map<number, ScheduleConfig>();
    scheduleConfigs.forEach(config => {
      if (config.isActive) {
        scheduleConfigsByDay.set(config.dayOfWeek, config);
      }
    });

    // 2. Pre-cargar time slots para el rango de fechas en batch
    const timeSlotsMap = new Map<string, TimeSlot>();
    const timeSlotsBatch = await this.timeSlotRepository.find({
      where: {
        company: { id: athleteSchedule.company.id },
        startTime: recurringStartTime,
        endTime: recurringEndTime,
        date: Between(periodStart, periodEnd)
      },
      relations: ['reservations']
    });
    timeSlotsBatch.forEach(ts => {
      const dateKey = new Date(ts.date).toISOString().split('T')[0];
      timeSlotsMap.set(dateKey, ts);
    });

    // 3. Pre-cargar reservas existentes del usuario para el rango de fechas
    const existingReservationsSet = new Set<string>();
    const existingReservations = await this.reservationRepository.find({
      where: {
        user: { id: athleteSchedule.user.id },
        timeSlot: { id: In(timeSlotsBatch.map(ts => ts.id)) }
      },
      relations: ['timeSlot']
    });
    existingReservations.forEach(res => {
      if (res.timeSlot) {
        const dateKey = new Date(res.timeSlot.date).toISOString().split('T')[0];
        existingReservationsSet.add(`${dateKey}-${res.timeSlot.startTime}-${res.timeSlot.endTime}`);
      }
    });

    // 4. Cuando generamos desde pago, NO necesitamos validar canBook (ya sabemos que puede reservar)
    // Solo validar si NO estamos generando desde pago
    const isGeneratingFromPayment = !!(customStartDate && customEndDate);
    const canBookGlobally = isGeneratingFromPayment ? true : await this.paymentsService.canUserBookClass(activeSubscription.id);
    
    // OPTIMIZACIÓN: Pre-cargar suscripción para actualizaciones batch
    let subscriptionForBatchUpdate = activeSubscription;

    try {
      this.logger.debug(`generateRecurringReservations -> start loop recurringId=${recurringReservationId}, remainingOccurrences=${remainingOccurrences}, remainingClasses=${remainingClassesPeriod}, classesPerWeek=${classesPerWeek}`);
      // Aumentar límite de generación para permitir más reservas en un solo proceso
      while (
        currentDate.getTime() <= endGenerationDate.getTime() &&
        generatedCount < 200 && // Aumentado de 50 a 200 para permitir generar más reservas
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

        // Verificar que el usuario pueda reservar (optimizado: solo si no estamos generando desde pago)
        if (!canBookGlobally) {
          // Si estamos generando desde pago, sabemos que puede reservar, pero validar fecha específica
          if (customStartDate && customEndDate) {
            // En generación desde pago, validar que la fecha esté dentro del período pagado
            const slotDateOnly = new Date(slotDate);
            slotDateOnly.setHours(0, 0, 0, 0);
            if (slotDateOnly < periodStart || slotDateOnly > periodEnd) {
              cannotBookDates.push(slotDate.toISOString().split('T')[0]);
              currentDate.setDate(currentDate.getDate() + 1);
              continue;
            }
          } else {
            // Validación completa solo si no estamos generando desde pago
        const canBook = await this.paymentsService.canUserBookClass(activeSubscription.id, slotDate);
        if (!canBook) {
          this.logger.verbose(`generateRecurringReservations -> canBook=false subscription=${activeSubscription.id} date=${slotDate.toISOString()}`);
          cannotBookDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
            }
          }
        }

        // OPTIMIZACIÓN: Usar time slot del mapa en lugar de query individual
        const dateKey = slotDate.toISOString().split('T')[0];
        let timeSlot = timeSlotsMap.get(dateKey);

        if (!timeSlot?.id) {
          this.logger.verbose(`generateRecurringReservations -> no timeslot configured date=${slotDate.toISOString()} start=${athleteSchedule.startTime}`);
          
          // NO auto-generar timeSlots - solo agregar a missingTimeSlotDates y crear clase disponible
          missingTimeSlotDates.push(slotDate.toISOString().split('T')[0]);
          
          // OPTIMIZACIÓN: Agrupar clase disponible para batch save al final
          if (paymentId && periodEndDate && remainingClassesPeriod > 0) {
            const availableClass = this.availableClassRepository.create({
              intendedDate: slotDate,
              reason: AvailableClassReason.MISSING_TIME_SLOT,
              status: AvailableClassStatus.AVAILABLE,
              expiresAt: periodEndDate,
              user: { id: athleteSchedule.user.id } as any,
              company: { id: athleteSchedule.company.id } as any,
              subscription: { id: activeSubscription.id } as any,
              payment: { id: paymentId } as any,
              notes: `Clase no reservada automáticamente por falta de turnos cargados el ${slotDate.toISOString().split('T')[0]}`
            });
            availableClassesToCreate.push(availableClass);
            availableClassesCreated++;
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // OPTIMIZACIÓN: Verificar duplicados usando el set pre-cargado
        const reservationKey = `${dateKey}-${recurringStartTime}-${recurringEndTime}`;
        if (existingReservationsSet.has(reservationKey)) {
          this.logger.verbose(`generateRecurringReservations -> reservation already exists timeSlot=${timeSlot.id}`);
          duplicateDates.push(slotDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const reservedCount = timeSlot.reservedCount ?? timeSlot.reservations?.length ?? 0;
        if (reservedCount >= timeSlot.capacity) {
          this.logger.verbose(`generateRecurringReservations -> timeSlot full id=${timeSlot.id}`);
          noCapacityDates.push(slotDate.toISOString().split('T')[0]);
          
          // OPTIMIZACIÓN: Agrupar clase disponible para batch save al final
          if (paymentId && periodEndDate && remainingClassesPeriod > 0) {
            const availableClass = this.availableClassRepository.create({
              intendedDate: slotDate,
              reason: AvailableClassReason.NO_CAPACITY,
              status: AvailableClassStatus.AVAILABLE,
              expiresAt: periodEndDate,
              user: { id: athleteSchedule.user.id } as any,
              company: { id: athleteSchedule.company.id } as any,
              subscription: { id: activeSubscription.id } as any,
              payment: { id: paymentId } as any,
              notes: `Clase no reservada automáticamente por falta de cupo el ${slotDate.toISOString().split('T')[0]}`
            });
            availableClassesToCreate.push(availableClass);
            availableClassesCreated++;
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Validar límite semanal (classesPerWeek)
        if (classesPerWeek > 0) {
          const weekKey = this.getWeekKey(slotDate);
          const currentWeekCount = weeklyReservationCount.get(weekKey) || 0;
          
          if (currentWeekCount >= classesPerWeek) {
            this.logger.verbose(`generateRecurringReservations -> weekly limit reached week=${weekKey}, count=${currentWeekCount}, limit=${classesPerWeek}`);
            skippedPastDates.push(slotDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }
        }

              const reservation = this.reservationRepository.create({
                user: { id: athleteSchedule.user.id } as any,
          timeSlot: { id: timeSlot.id } as any,
          timeSlotId: timeSlot.id,
        });

        const savedReservation = await this.reservationRepository.save(reservation);
        this.logger.log(`generateRecurringReservations -> created reservation id=${savedReservation.id} date=${slotDate.toISOString()}`);

        // OPTIMIZACIÓN: Agrupar ClassUsage para batch save al final (no llamar registerClassUsage en el loop)
        if (isGeneratingFromPayment) {
          // Cuando generamos desde pago, crear ClassUsage directamente sin validaciones costosas
          classUsagesToCreate.push({
            type: ClassUsageType.RESERVATION,
            usageDate: slotDate,
            notes: `Reserva recurrente - ${recurringStartTime} a ${recurringEndTime}`,
            user: { id: athleteSchedule.user.id },
            company: { id: athleteSchedule.company.id },
            subscription: { id: activeSubscription.id }
          });
          totalClassesToRegister++;
        } else {
          // Solo si NO es desde pago, usar el método completo
        try {
          await this.paymentsService.registerClassUsage(activeSubscription.id, {
            type: ClassUsageType.RESERVATION,
            usageDate: slotDate,
            notes: `Reserva recurrente - ${recurringStartTime} a ${recurringEndTime}`
          });
          } catch (error) {
            await this.reservationRepository.delete({ id: savedReservation.id });
            this.logger.error(`generateRecurringReservations -> error registering class usage date=${slotDate.toISOString()}: ${error?.message}`, error?.stack);
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }
        }

        // OPTIMIZACIÓN: Contar reservas por timeSlot para batch update al final
        // Usar Map para manejar correctamente múltiples reservas al mismo timeSlot
        const currentCount = timeSlotsReservationCount.get(timeSlot.id) || reservedCount;
        timeSlotsReservationCount.set(timeSlot.id, currentCount + 1);

          remainingClassesPeriod--;
          remainingOccurrences--;
          generatedCount++;
          
          // Actualizar contador semanal
          if (classesPerWeek > 0) {
            const weekKey = this.getWeekKey(slotDate);
            const currentWeekCount = weeklyReservationCount.get(weekKey) || 0;
            weeklyReservationCount.set(weekKey, currentWeekCount + 1);
          }
          
          lastGeneratedDate = new Date(slotDate);

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // OPTIMIZACIÓN: Batch save de ClassUsage al final (solo cuando generamos desde pago)
    if (isGeneratingFromPayment && classUsagesToCreate.length > 0) {
      try {
        await this.classUsageRepository.save(classUsagesToCreate);
        this.logger.log(`generateRecurringReservations -> batch saved ${classUsagesToCreate.length} class usages`);
        
        // Actualizar contadores de la suscripción en batch (una sola vez)
        if (totalClassesToRegister > 0) {
          await this.subscriptionRepository.increment(
            { id: activeSubscription.id },
            'classesUsedThisPeriod',
            totalClassesToRegister
          );
          await this.subscriptionRepository.decrement(
            { id: activeSubscription.id },
            'classesRemainingThisPeriod',
            totalClassesToRegister
          );
          await this.subscriptionRepository.increment(
            { id: activeSubscription.id },
            'classesUsedThisWeek',
            totalClassesToRegister
          );
          await this.subscriptionRepository.decrement(
            { id: activeSubscription.id },
            'classesRemainingThisWeek',
            totalClassesToRegister
          );
          this.logger.log(`generateRecurringReservations -> batch updated subscription counters: +${totalClassesToRegister} classes`);
        }
        } catch (error) {
        this.logger.error(`generateRecurringReservations -> error batch saving class usages: ${error?.message}`);
      }
    }

    // OPTIMIZACIÓN: Batch save de clases disponibles al final
    if (availableClassesToCreate.length > 0) {
      try {
        await this.availableClassRepository.save(availableClassesToCreate);
        this.logger.log(`generateRecurringReservations -> batch saved ${availableClassesToCreate.length} available classes`);
      } catch (error) {
        this.logger.error(`generateRecurringReservations -> error batch saving available classes: ${error?.message}`);
      }
    }

    // OPTIMIZACIÓN: Batch update de time slots al final
    // Actualizar reservedCount correctamente contando las reservas creadas
    if (timeSlotsReservationCount.size > 0) {
      try {
        await Promise.all(Array.from(timeSlotsReservationCount.entries()).map(([timeSlotId, newReservedCount]) => 
          this.timeSlotRepository.update({ id: timeSlotId }, { reservedCount: newReservedCount })
        ));
        this.logger.log(`generateRecurringReservations -> batch updated ${timeSlotsReservationCount.size} time slots`);
      } catch (error) {
        this.logger.error(`generateRecurringReservations -> error batch updating time slots: ${error?.message}`);
      }
    }

    await this.athleteScheduleRepository.update(recurringReservationId, {
      currentOccurrences: athleteSchedule.currentOccurrences + generatedCount,
        lastGeneratedDate: lastGeneratedDate ?? athleteSchedule.lastGeneratedDate
    });
    this.logger.log(`generateRecurringReservations -> completed recurringId=${recurringReservationId}, generated=${generatedCount}, availableClasses=${availableClassesCreated}`);
    return {
      createdReservations: generatedCount,
      skippedPastDates,
      noCapacityDates,
      cannotBookDates,
      duplicateDates,
      missingTimeSlotDates,
      availableClassesCreated,
    };
  } catch (error) {
      this.logger.error(`generateRecurringReservations -> fatal error recurringId=${recurringReservationId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * Obtener clases disponibles del usuario
   */
  async getUserAvailableClasses(userId: string): Promise<AvailableClass[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await this.availableClassRepository.find({
      where: {
        user: { id: userId },
        status: AvailableClassStatus.AVAILABLE
      },
      relations: ['payment', 'subscription', 'company'],
      order: {
        expiresAt: 'ASC',
        intendedDate: 'ASC'
      }
    }).then(classes => 
      classes.filter(ac => {
        const expiresAt = new Date(ac.expiresAt);
        expiresAt.setHours(0, 0, 0, 0);
        return expiresAt >= today;
      })
    );
  }

  /**
   * Obtener conteo de clases disponibles del usuario
   */
  async getAvailableClassesCount(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.availableClassRepository.count({
      where: {
        user: { id: userId },
        status: AvailableClassStatus.AVAILABLE
      }
    });

    // Filtrar por expiresAt >= hoy
    const allClasses = await this.availableClassRepository.find({
      where: {
        user: { id: userId },
        status: AvailableClassStatus.AVAILABLE
      }
    });

    return allClasses.filter(ac => {
      const expiresAt = new Date(ac.expiresAt);
      expiresAt.setHours(0, 0, 0, 0);
      return expiresAt >= today;
    }).length;
  }

  /**
   * Generar reservas automáticamente cuando se acredita el pago
   * Basado en las reservas recurrentes activas del usuario
   * @param paymentStartDate Fecha de inicio (fecha de pago)
   * @param paymentEndDate Fecha de fin (fecha de pago + 31 días)
   * @param paymentId ID del pago que generó estas reservas
   */
  async generateReservationsFromRecurringOnPayment(
    userId: string,
    companyId: string,
    subscriptionId: string,
    paymentStartDate: Date,
    paymentEndDate: Date,
    paymentId?: string
  ): Promise<{ createdReservations: number; skippedDates: string[]; errors: string[]; availableClassesCreated: number }> {
    this.logger.log(`generateReservationsFromRecurringOnPayment -> userId=${userId}, companyId=${companyId}, subscriptionId=${subscriptionId}`);
    
    // 1. Obtener suscripción con relaciones
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['paymentPlan', 'user', 'company']
    });

    if (!subscription) {
      throw new BadRequestException('Suscripción no encontrada');
    }

    // 2. Buscar todas las reservas recurrentes activas del usuario para esa empresa
    const activeAthleteSchedules = await this.athleteScheduleRepository.find({
      where: {
        user: { id: userId },
        company: { id: companyId },
        status: ScheduleStatus.ACTIVE
      },
      relations: ['user', 'company']
    });

    if (activeAthleteSchedules.length === 0) {
      this.logger.log(`generateReservationsFromRecurringOnPayment -> no active athlete schedules for user=${userId}`);
      return { createdReservations: 0, skippedDates: [], errors: [], availableClassesCreated: 0 };
    }

    // 3. Obtener el pago y la fecha de vencimiento del período
    let payment: Payment | null = null;
    let periodEndDate: Date = paymentEndDate;
    
    if (paymentId) {
      payment = await this.paymentRepository.findOne({
        where: { id: paymentId },
        relations: ['subscription']
      });
      
      if (payment && payment.subscription) {
        const subscription = await this.subscriptionRepository.findOne({
          where: { id: payment.subscription.id }
        });
        if (subscription) {
          periodEndDate = new Date(subscription.periodEndDate);
        }
      }
    }

    // 4. Generar reservas para cada horario del atleta
    let totalCreated = 0;
    let totalAvailableClassesCreated = 0;
    const allSkippedDates: string[] = [];
    const allErrors: string[] = [];

    for (const athleteSchedule of activeAthleteSchedules) {
      try {
        // Pasar las fechas del período de pago (fecha de pago a fecha de pago + 31 días)
        const summary = await this.generateRecurringReservations(
          athleteSchedule.id,
          paymentStartDate,
          paymentEndDate,
          paymentId,
          periodEndDate
        );
        totalCreated += summary.createdReservations;
        totalAvailableClassesCreated += summary.availableClassesCreated || 0;
        allSkippedDates.push(...summary.skippedPastDates);
        allSkippedDates.push(...summary.noCapacityDates);
        allSkippedDates.push(...summary.cannotBookDates);
        allSkippedDates.push(...summary.duplicateDates);
        allSkippedDates.push(...summary.missingTimeSlotDates);
      } catch (error) {
        const errorMsg = `Error generando reservas para horario del atleta ${athleteSchedule.id}: ${error?.message}`;
        this.logger.error(`generateReservationsFromRecurringOnPayment -> ${errorMsg}`, error?.stack);
        allErrors.push(errorMsg);
      }
    }

    this.logger.log(
      `generateReservationsFromRecurringOnPayment -> completed userId=${userId}, created=${totalCreated}, availableClasses=${totalAvailableClassesCreated}, skipped=${allSkippedDates.length}, errors=${allErrors.length}`
    );

    return {
      createdReservations: totalCreated,
      skippedDates: [...new Set(allSkippedDates)], // Eliminar duplicados
      errors: allErrors,
      availableClassesCreated: totalAvailableClassesCreated
    };
  }

  /**
   * Obtener reservas recurrentes de un usuario
   */
  async getUserRecurringReservations(userId: string): Promise<AthleteSchedule[]> {
    return await this.athleteScheduleRepository.find({
      where: { 
        user: { id: userId }
      },
      relations: ['company', 'user'],
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Obtener el estado de los horarios fijos (fechas con problemas)
   */
  async getRecurringReservationStatus(
    recurringReservationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    noCapacityDates: string[];
    missingTimeSlotDates: string[];
    canBookDates: string[];
  }> {
    const athleteSchedule = await this.athleteScheduleRepository.findOne({
      where: { id: recurringReservationId },
      relations: ['user', 'company']
    });

    if (!athleteSchedule || athleteSchedule.status !== ScheduleStatus.ACTIVE) {
      return {
        noCapacityDates: [],
        missingTimeSlotDates: [],
        canBookDates: []
      };
    }

    const activeSubscription = await this.getActiveSubscriptionForUser(athleteSchedule.user.id);
    if (!activeSubscription) {
      return {
        noCapacityDates: [],
        missingTimeSlotDates: [],
        canBookDates: []
      };
    }

    // Usar fechas proporcionadas o del período de suscripción
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const periodStart = startDate ? new Date(startDate) : new Date(activeSubscription.periodStartDate);
    periodStart.setHours(0, 0, 0, 0);
    
    const periodEnd = endDate ? new Date(endDate) : new Date(activeSubscription.periodEndDate);
    periodEnd.setHours(23, 59, 59, 999);

    // Ajustar para empezar desde hoy o desde el inicio del período (lo que sea mayor)
    const effectiveStart = periodStart.getTime() > today.getTime() ? periodStart : today;
    let currentDate = new Date(effectiveStart);
    currentDate.setHours(0, 0, 0, 0);

    const noCapacityDates: string[] = [];
    const missingTimeSlotDates: string[] = [];
    const canBookDates: string[] = [];

    let daysOfWeek: number[];
    if (typeof athleteSchedule.daysOfWeek === 'string') {
      daysOfWeek = athleteSchedule.daysOfWeek.split(',').map(Number);
    } else if (Array.isArray(athleteSchedule.daysOfWeek)) {
      daysOfWeek = (athleteSchedule.daysOfWeek as any[]).map(Number);
    } else {
      daysOfWeek = [];
    }

    const recurringStartTime = this.normalizeTimeString(athleteSchedule.startTime);
    const recurringEndTime = this.normalizeTimeString(athleteSchedule.endTime);

    // Verificar hasta 60 días en el futuro
    let daysChecked = 0;
    while (currentDate.getTime() <= periodEnd.getTime() && daysChecked < 60) {
      const dayOfWeek = currentDate.getDay();
      
      if (daysOfWeek.includes(dayOfWeek)) {
        const slotDate = new Date(currentDate);
        slotDate.setHours(0, 0, 0, 0);

        // Verificar si puede reservar
        const canBook = await this.paymentsService.canUserBookClass(activeSubscription.id, slotDate);
        if (!canBook) {
          currentDate.setDate(currentDate.getDate() + 1);
          daysChecked++;
          continue;
        }

        // Buscar el time slot
        const timeSlot = await this.timeSlotRepository.findOne({
          where: {
            date: slotDate,
            startTime: recurringStartTime,
            endTime: recurringEndTime,
            company: { id: athleteSchedule.company.id }
          },
          relations: ['reservations']
        });

        if (!timeSlot?.id) {
          missingTimeSlotDates.push(slotDate.toISOString().split('T')[0]);
        } else {
          const reservedCount = timeSlot.reservedCount ?? timeSlot.reservations?.length ?? 0;
          if (reservedCount >= timeSlot.capacity) {
            noCapacityDates.push(slotDate.toISOString().split('T')[0]);
          } else {
            canBookDates.push(slotDate.toISOString().split('T')[0]);
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
      daysChecked++;
    }

    return {
      noCapacityDates,
      missingTimeSlotDates,
      canBookDates
    };
  }

  /**
   * Obtener todas las reservas recurrentes de una empresa
   */
  async getCompanyRecurringReservations(companyId: string): Promise<AthleteSchedule[]> {
    return await this.athleteScheduleRepository.find({
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
    this.logger.debug(`cancelRecurringReservation -> recurringId=${recurringReservationId}, userId=${userId}, deleteReservations=${deleteReservations}`);
    
    const athleteSchedule = await this.athleteScheduleRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      },
      relations: ['company', 'user']
    });

    if (!athleteSchedule) {
      this.logger.warn(`cancelRecurringReservation -> Athlete schedule not found: ${recurringReservationId}`);
      throw new BadRequestException('Horario del atleta no encontrado');
    }

    // Obtener la suscripción activa del usuario para restaurar clases (opcional)
    const activeSubscription = await this.getActiveSubscriptionForUser(userId);
    
    // Si no hay suscripción activa pero se quiere eliminar reservas, solo permitir eliminar el horario fijo
    // sin restaurar clases
    if (!activeSubscription && deleteReservations) {
      this.logger.warn(`cancelRecurringReservation -> No active subscription for user ${userId}, will only delete schedule without restoring classes`);
      // Continuar pero sin restaurar clases
    }

    let deletedReservationsCount = 0;
    let deletedTimeSlotsCount = 0;
    let restoredClassesCount = 0;

    // Normalizar horarios de la reserva recurrente
    const recurringStartTime = this.normalizeTimeString(athleteSchedule.startTime);
    const recurringEndTime = this.normalizeTimeString(athleteSchedule.endTime);
    this.logger.debug(`cancelRecurringReservation -> recurring times: ${recurringStartTime}-${recurringEndTime}`);

    // Si se debe eliminar las reservas asociadas
    if (deleteReservations) {
      // Obtener los días de la semana de la reserva recurrente
      let daysOfWeek: number[];
      if (typeof athleteSchedule.daysOfWeek === 'string') {
        daysOfWeek = athleteSchedule.daysOfWeek.split(',').map(Number);
      } else if (Array.isArray(athleteSchedule.daysOfWeek)) {
        daysOfWeek = (athleteSchedule.daysOfWeek as any[]).map(Number);
      } else {
        daysOfWeek = [];
      }
      this.logger.debug(`cancelRecurringReservation -> daysOfWeek: ${daysOfWeek.join(',')}`);

      // Buscar todas las reservas del usuario que coincidan con los días y horarios de la reserva recurrente
      const startDate = new Date(athleteSchedule.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      // Buscar todas las reservas del usuario
      const userReservations = await this.reservationRepository.find({
        where: {
          user: { id: userId }
        },
        relations: ['timeSlot', 'timeSlot.company']
      });
      this.logger.debug(`cancelRecurringReservation -> found ${userReservations.length} user reservations`);

      // Filtrar reservas que coincidan con la reserva recurrente
      const reservationsToDelete = userReservations.filter(reservation => {
        if (!reservation.timeSlot) {
          return false;
        }

        const reservationDate = new Date(reservation.timeSlot.date);
        reservationDate.setHours(0, 0, 0, 0);
        
        // Verificar que la fecha sea igual o posterior a la fecha de inicio
        if (reservationDate < startDate) {
          return false;
        }

        // Verificar que coincida el día de la semana
        const dayOfWeek = reservationDate.getDay();
        if (!daysOfWeek.includes(dayOfWeek)) {
          return false;
        }

        // Verificar que coincida el horario (normalizar antes de comparar)
        if (!reservation.timeSlot.startTime || !reservation.timeSlot.endTime) {
          return false;
        }

        const normalizedStartTime = this.normalizeTimeString(reservation.timeSlot.startTime);
        const normalizedEndTime = this.normalizeTimeString(reservation.timeSlot.endTime);

        if (normalizedStartTime !== recurringStartTime || normalizedEndTime !== recurringEndTime) {
          return false;
        }

        // Verificar que sea del mismo company
        if (!reservation.timeSlot.company || reservation.timeSlot.company.id !== athleteSchedule.company.id) {
          return false;
        }

        return true;
      });

      this.logger.log(`cancelRecurringReservation -> found ${reservationsToDelete.length} reservations to delete`);

      // Crear un mapa de fechas de reservas para buscar ClassUsage más eficientemente
      const reservationDateMap = new Map<string, Date>();
      for (const reservation of reservationsToDelete) {
        if (reservation.timeSlot && reservation.timeSlot.date) {
          const date = new Date(reservation.timeSlot.date);
          date.setHours(0, 0, 0, 0);
          const dateKey = date.toISOString().split('T')[0];
          reservationDateMap.set(dateKey, date);
        }
      }

      this.logger.debug(`cancelRecurringReservation -> reservation dates: ${Array.from(reservationDateMap.keys()).join(', ')}`);

      // Solo restaurar clases si hay suscripción activa
      if (activeSubscription) {
        // Buscar todos los ClassUsage del usuario para esta suscripción y tipo RESERVATION
        const allClassUsages = await this.classUsageRepository.find({
          where: {
            user: { id: userId },
            subscription: { id: activeSubscription.id },
            type: ClassUsageType.RESERVATION
          },
          relations: ['user', 'subscription']
        });
        this.logger.debug(`cancelRecurringReservation -> found ${allClassUsages.length} class usages`);

        // Filtrar los ClassUsage que coincidan con las fechas de las reservas a eliminar
        const classUsagesToRemove = allClassUsages.filter(classUsage => {
          const usageDate = new Date(classUsage.usageDate);
          usageDate.setHours(0, 0, 0, 0);
          const usageDateKey = usageDate.toISOString().split('T')[0];
          return reservationDateMap.has(usageDateKey);
        });

        this.logger.log(`cancelRecurringReservation -> found ${classUsagesToRemove.length} class usages to remove`);

        // Eliminar los registros de ClassUsage
        for (const classUsage of classUsagesToRemove) {
          await this.classUsageRepository.remove(classUsage);
          restoredClassesCount++;
          this.logger.verbose(`cancelRecurringReservation -> removed classUsage id=${classUsage.id}, date=${classUsage.usageDate}`);
        }

        // Restaurar contadores de clases en la suscripción
        if (restoredClassesCount > 0) {
          // Recargar la suscripción para obtener valores actualizados
          const updatedSubscription = await this.subscriptionRepository.findOne({
            where: { id: activeSubscription.id },
            relations: ['paymentPlan']
          });

          if (updatedSubscription) {
            const classesPerWeek = updatedSubscription.paymentPlan?.classesPerWeek ?? 0;
            const maxClassesPerPeriod = updatedSubscription.paymentPlan?.maxClassesPerPeriod ?? 0;

            // Restaurar contadores semanales (restar de usadas, sumar a disponibles)
            const previousUsedThisWeek = updatedSubscription.classesUsedThisWeek ?? 0;
            const previousRemainingThisWeek = updatedSubscription.classesRemainingThisWeek ?? 0;

            updatedSubscription.classesUsedThisWeek = Math.max(0, previousUsedThisWeek - restoredClassesCount);
            updatedSubscription.classesRemainingThisWeek = Math.min(
              classesPerWeek,
              previousRemainingThisWeek + restoredClassesCount
            );

            // Restaurar contadores del período (restar de usadas, sumar a disponibles)
            const previousUsedThisPeriod = updatedSubscription.classesUsedThisPeriod ?? 0;
            const previousRemainingThisPeriod = updatedSubscription.classesRemainingThisPeriod ?? 0;

            updatedSubscription.classesUsedThisPeriod = Math.max(0, previousUsedThisPeriod - restoredClassesCount);
            updatedSubscription.classesRemainingThisPeriod = Math.min(
              maxClassesPerPeriod,
              previousRemainingThisPeriod + restoredClassesCount
            );

            await this.subscriptionRepository.save(updatedSubscription);
            this.logger.log(`cancelRecurringReservation -> restored ${restoredClassesCount} classes. Weekly: ${previousUsedThisWeek}->${updatedSubscription.classesUsedThisWeek} used, ${previousRemainingThisWeek}->${updatedSubscription.classesRemainingThisWeek} remaining. Period: ${previousUsedThisPeriod}->${updatedSubscription.classesUsedThisPeriod} used, ${previousRemainingThisPeriod}->${updatedSubscription.classesRemainingThisPeriod} remaining`);
          }
        }
      } else {
        this.logger.log(`cancelRecurringReservation -> skipping class restoration (no active subscription)`);
      }

      // Eliminar las reservas y actualizar contadores de time slots
      const timeSlotsToUpdate = new Map<string, { timeSlot: TimeSlot; count: number }>();

      for (const reservation of reservationsToDelete) {
        if (!reservation.timeSlot || !reservation.id) {
          continue;
        }

        // Eliminar la reserva
        await this.reservationRepository.delete(reservation.id);
        deletedReservationsCount++;
        this.logger.verbose(`cancelRecurringReservation -> deleted reservation id=${reservation.id}, date=${reservation.timeSlot.date}`);

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

      this.logger.log(`cancelRecurringReservation -> deleted ${deletedReservationsCount} reservations`);

      // Actualizar contadores de time slots (NO eliminar, solo restaurar capacidad)
      for (const [timeSlotId, slotData] of timeSlotsToUpdate) {
        if (!slotData.timeSlot) {
          continue;
        }

        const currentReservedCount = slotData.timeSlot.reservedCount || 0;
        const newReservedCount = Math.max(0, currentReservedCount - slotData.count);
        
        await this.timeSlotRepository.update(timeSlotId, { reservedCount: newReservedCount });
        this.logger.verbose(`cancelRecurringReservation -> updated timeSlot id=${timeSlotId}, reservedCount: ${currentReservedCount}->${newReservedCount} (capacity restored, timeSlot kept)`);
      }

      this.logger.log(`cancelRecurringReservation -> updated ${timeSlotsToUpdate.size} timeSlots (capacity restored, no timeSlots deleted)`);
    }

    // Eliminar la reserva recurrente (no solo cancelarla)
    await this.athleteScheduleRepository.remove(athleteSchedule);
    this.logger.log(`cancelRecurringReservation -> deleted recurring reservation id=${recurringReservationId}`);

    return {
      message: 'Reserva recurrente eliminada exitosamente',
      deletedReservations: deletedReservationsCount,
      deletedTimeSlots: deletedTimeSlotsCount,
      restoredClasses: restoredClassesCount
    };
  }

  /**
   * Actualizar una reserva recurrente
   */
  async updateRecurringReservation(
    recurringReservationId: string,
    userId: string,
    updateDto: any
  ): Promise<AthleteSchedule> {
    this.logger.debug(`updateRecurringReservation -> recurringId=${recurringReservationId}, userId=${userId}`);
    
    const athleteSchedule = await this.athleteScheduleRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      },
      relations: ['company', 'user']
    });

    if (!athleteSchedule) {
      throw new BadRequestException('Horario del atleta no encontrado');
    }

    // Normalizar tiempos si se proporcionan
    const normalizedStartTime = updateDto.startTime 
      ? this.normalizeTimeString(updateDto.startTime)
      : athleteSchedule.startTime;
    
    const normalizedEndTime = updateDto.endTime 
      ? this.normalizeTimeString(updateDto.endTime)
      : athleteSchedule.endTime;

    // Preparar datos de actualización
    const updateData: any = {};

    if (updateDto.daysOfWeek && Array.isArray(updateDto.daysOfWeek)) {
      updateData.daysOfWeek = updateDto.daysOfWeek.join(',');
    }

    if (updateDto.startTime) {
      updateData.startTime = normalizedStartTime;
    }

    if (updateDto.endTime) {
      updateData.endTime = normalizedEndTime;
    }

    if (updateDto.status) {
      updateData.status = updateDto.status;
    }

    if (updateDto.notes !== undefined) {
      updateData.notes = updateDto.notes;
    }

    // Actualizar el horario
    await this.athleteScheduleRepository.update(recurringReservationId, updateData);

    // Recargar y retornar el horario actualizado
    const updatedSchedule = await this.athleteScheduleRepository.findOne({
      where: { id: recurringReservationId },
      relations: ['company', 'user']
    });

    this.logger.log(`updateRecurringReservation -> updated recurring reservation id=${recurringReservationId}`);

    return updatedSchedule;
  }

  /**
   * Pausar una reserva recurrente
   */
  async pauseRecurringReservation(recurringReservationId: string, userId: string): Promise<void> {
    const athleteSchedule = await this.athleteScheduleRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      }
    });

    if (!athleteSchedule) {
      throw new BadRequestException('Horario del atleta no encontrado');
    }

    await this.athleteScheduleRepository.update(recurringReservationId, {
      status: ScheduleStatus.PAUSED
    });
  }

  /**
   * Reanudar una reserva recurrente
   */
  async resumeRecurringReservation(recurringReservationId: string, userId: string): Promise<void> {
    const athleteSchedule = await this.athleteScheduleRepository.findOne({
      where: { 
        id: recurringReservationId,
        user: { id: userId }
      }
    });

    if (!athleteSchedule) {
      throw new BadRequestException('Horario del atleta no encontrado');
    }

    await this.athleteScheduleRepository.update(recurringReservationId, {
      status: ScheduleStatus.ACTIVE
    });

    // Generar reservas pendientes
    await this.generateRecurringReservations(recurringReservationId);
  }

  /**
   * Obtener lista de espera del usuario
   */
  async getUserWaitlist(userId: string) {
    return await this.waitlistRepository.find({
      where: {
        user: { id: userId },
        status: WaitlistStatus.PENDING
      },
      relations: ['timeSlot', 'user'],
      order: { createdAt: 'ASC' }
    });
  }

  /**
   * Cancelar entrada de lista de espera
   */
  async cancelWaitlistEntry(waitlistId: string, userId: string) {
    const waitlistEntry = await this.waitlistRepository.findOne({
      where: { id: waitlistId },
      relations: ['user']
    });

    if (!waitlistEntry) {
      throw new BadRequestException('Entrada de lista de espera no encontrada');
    }

    if (waitlistEntry.userId !== userId) {
      throw new ForbiddenException('Solo puedes cancelar tus propias entradas de lista de espera');
    }

    waitlistEntry.status = WaitlistStatus.CANCELLED;
    await this.waitlistRepository.save(waitlistEntry);

    return { message: 'Entrada de lista de espera cancelada exitosamente' };
  }

  /**
   * Obtener lista de espera de un TimeSlot (admin)
   */
  async getTimeSlotWaitlist(timeSlotId: string) {
    return await this.waitlistRepository.find({
      where: {
        timeSlot: { id: timeSlotId },
        status: WaitlistStatus.PENDING
      },
      relations: ['user', 'timeSlot'],
      order: { createdAt: 'ASC' }
    });
  }

  /**
   * Obtener alumnos de un TimeSlot (admin)
   */
  async getTimeSlotStudents(timeSlotId: string) {
    const reservations = await this.reservationRepository.find({
      where: { timeSlotId },
      relations: ['user', 'timeSlot']
    });

    return reservations.map(reservation => ({
      id: reservation.id,
      userId: reservation.user.id,
      nombre: reservation.user.name || '',
      apellido: reservation.user.lastName || '',
      email: reservation.user.email || '',
      telefono: reservation.user.phoneNumber || '',
      attendanceStatus: reservation.attendanceStatus,
      fechaReserva: reservation.createdAt
    })).sort((a, b) => {
      // Ordenar por apellido y luego por nombre
      const apellidoA = a.apellido.toLowerCase();
      const apellidoB = b.apellido.toLowerCase();
      if (apellidoA !== apellidoB) {
        return apellidoA.localeCompare(apellidoB);
      }
      return a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase());
    });
  }

  /**
   * Obtener TimeSlots disponibles con cupo
   */
  async getAvailableTimeSlotsWithCapacity(
    companyId: string,
    startDate: string,
    endDate: string,
    minAvailableSpots: number = 1
  ) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const timeSlots = await this.timeSlotRepository.find({
      where: {
        company: { id: companyId },
        date: Between(start, end)
      },
      relations: ['reservations', 'company']
    });

    // Filtrar solo los que tienen cupo disponible y cumplen con minAvailableSpots
    const availableSlots = timeSlots
      .map(slot => {
        const reservedCount = slot.reservedCount ?? slot.reservations?.length ?? 0;
        const availableSpots = slot.capacity - reservedCount;
        return {
          ...slot,
          reservedCount,
          availableSpots,
          attendedCount: slot.attendedCount || 0
        };
      })
      .filter(slot => slot.availableSpots >= minAvailableSpots);

    return availableSlots;
  }
}
