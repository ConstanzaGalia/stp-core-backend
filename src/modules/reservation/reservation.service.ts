import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
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

  async cancelReservation(reservationId: string): Promise<void> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['timeSlot'],
    });

    if (reservation) {
      const timeSlot = reservation.timeSlot;
      timeSlot.reservedCount = Math.max(0, timeSlot.reservedCount - 1);
      await this.timeSlotRepository.save(timeSlot);
      await this.reservationRepository.remove(reservation);
    } else {
      throw new BadRequestException('Reservation not found');
    }
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
}
