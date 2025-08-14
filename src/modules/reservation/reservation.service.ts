import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { ScheduleConfig } from 'src/entities/schedule-config.entity';
import { ScheduleException } from 'src/entities/schedule-exception.entity';
import { Repository } from 'typeorm';


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

    const timeSlots: TimeSlot[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const configForDay = scheduleConfigs.find(config => 
        config.dayOfWeek === dayOfWeek && config.isActive
      );

      if (configForDay) {
        let currentTime = new Date(`${currentDate.toISOString().split('T')[0]}T${configForDay.startTime}`);
        const endTimeDate = new Date(`${currentDate.toISOString().split('T')[0]}T${configForDay.endTime}`);

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
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return await this.timeSlotRepository.save(timeSlots);
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
