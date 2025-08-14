import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { ScheduleConfig } from 'src/entities/schedule-config.entity';
import { ScheduleException } from 'src/entities/schedule-exception.entity';
import { TimeSlotGeneration } from 'src/entities/time-slot-generation.entity';
import { Repository, Between } from 'typeorm';


@Injectable()
export class ReservationsService {
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
  ) {}

  async createReservation(userId: string, timeSlotId: string): Promise<Reservation> {
    const timeSlot = await this.timeSlotRepository.findOne({
      where: { id: timeSlotId },
      relations: ['reservations'],
    });

    if (!timeSlot) {
      throw new BadRequestException('Time slot not found');
    }

    if (timeSlot.isAvailable()) {
      timeSlot.reservedCount += 1;
      await this.timeSlotRepository.save(timeSlot);

      const reservation = this.reservationRepository.create({
        user: { id: userId },
        timeSlot: { id: timeSlotId },
      });

      return this.reservationRepository.save(reservation);
    } else {
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
        
        // Crear fechas de tiempo para este día
        const dateString = currentDate.toISOString().split('T')[0];
        let currentTime = new Date(`${dateString}T${configForDay.startTime}:00`);
        const endTimeDate = new Date(`${dateString}T${configForDay.endTime}:00`);

        while (currentTime < endTimeDate) {
          const slot = this.timeSlotRepository.create({
            date: new Date(currentDate),
            startTime: currentTime.toISOString().split('T')[1].slice(0, 5),
            endTime: new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString().split('T')[1].slice(0, 5),
            capacity: configForDay.capacity,
            company: company,
          });

          timeSlots.push(slot);
          totalSlotsCreated++;
          currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
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

    const data = generations.map(generation => {
      
      return {
        id: generation.id,
        startDate: generation.startDate,
        endDate: generation.endDate,
        totalDays: generation.totalDays,
        totalTimeSlots: generation.totalTimeSlots,
        daysWithConfig: generation.daysWithConfig,
        daysWithoutConfig: generation.daysWithoutConfig,
        createdAt: generation.createdAt,
        // Información adicional calculada - usando UTC para evitar problemas de zona horaria
        dateRange: `${this.formatDateToUTC(generation.startDate)} - ${this.formatDateToUTC(generation.endDate)}`,
        averageSlotsPerDay: generation.totalDays > 0 ? Math.round(generation.totalTimeSlots / generation.totalDays) : 0,
        successRate: generation.totalDays > 0 ? Math.round((generation.daysWithConfig / generation.totalDays) * 100) : 0,
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
      relations: ['timeSlot', 'timeSlot.company'],
      order: { id: 'DESC' },
    });

    return reservations.map(reservation => {
      const timeSlotDate = new Date(reservation.timeSlot.date);
      const timeSlotTime = reservation.timeSlot.startTime;
      const [hours, minutes] = timeSlotTime.split(':').map(Number);
      timeSlotDate.setHours(hours, minutes, 0, 0);

      const now = new Date();
      const twoHoursBefore = new Date(timeSlotDate.getTime() - 2 * 60 * 60 * 1000);

      return {
        id: reservation.id,
        userId: reservation.user.id,
        timeSlotId: reservation.timeSlot.id,
        date: reservation.timeSlot.date,
        startTime: reservation.timeSlot.startTime,
        endTime: reservation.timeSlot.endTime,
        companyName: reservation.timeSlot.company.name,
        canCancel: now < twoHoursBefore,
        cancelDeadline: twoHoursBefore,
        createdAt: reservation.createdAt,
      };
    });
  }

  // Métodos para gestión de excepciones de horarios
  async createScheduleException(
    companyId: string,
    createScheduleExceptionDto: any,
  ): Promise<ScheduleException> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    
    if (!company) {
      throw new BadRequestException('Company not found');
    }

    const result = await this.scheduleExceptionRepository.insert({
      ...createScheduleExceptionDto,
      company: { id: companyId },
    });

    return await this.scheduleExceptionRepository.findOne({ where: { id: result.identifiers[0].id } });
  }

  async getScheduleExceptions(companyId: string): Promise<ScheduleException[]> {
    return this.scheduleExceptionRepository.find({
      where: { company: { id: companyId } },
      order: { exceptionDate: 'ASC' },
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

    Object.assign(scheduleException, updateScheduleExceptionDto);
    return await this.scheduleExceptionRepository.save(scheduleException);
  }

  async deleteScheduleException(id: string): Promise<void> {
    const scheduleException = await this.scheduleExceptionRepository.findOne({ where: { id } });
    
    if (!scheduleException) {
      throw new BadRequestException('Schedule exception not found');
    }

    await this.scheduleExceptionRepository.remove(scheduleException);
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
}
