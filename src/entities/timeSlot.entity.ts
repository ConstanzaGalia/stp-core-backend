import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Company } from './company.entity';
import { Reservation } from './reservation.entity';
import { ScheduleResource } from './schedule-resource.entity';

@Entity()
export class TimeSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date;

  @Column()
  startTime: string;

  @Column()
  endTime: string;

  @Column()
  capacity: number;

  @Column({ type: 'int', default: 0 })
  reservedCount: number;

  @Column({ type: 'int', default: 0 })
  attendedCount: number; // Contador de alumnos que asistieron

  @Column({ type: 'int', default: 60 })
  durationMinutes: number; // Duración del turno en minutos

  @Column({ type: 'boolean', default: false })
  isIntermediateSlot: boolean; // Indica si es un turno intermedio/superpuesto

  @ManyToOne(() => ScheduleResource, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resource_id' })
  resource: ScheduleResource | null;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  @ManyToOne(() => Company, company => company.timeSlots, { onDelete: 'CASCADE' })
  company: Company;

  @OneToMany(() => Reservation, reservation => reservation.timeSlot)
  reservations: Reservation[];

  isAvailable() {
    return this.reservedCount < this.capacity;
  }
}
