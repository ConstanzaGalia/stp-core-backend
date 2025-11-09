import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';

export enum RecurringFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

export enum RecurringEndType {
  DATE = 'date',
  COUNT = 'count',
  NEVER = 'never'
}

export enum RecurringStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

@Entity('recurring_reservations')
export class RecurringReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RecurringFrequency })
  frequency: RecurringFrequency;

  @Column({ type: 'simple-array' })
  daysOfWeek: string; // Ejemplo: "1,3,5" (Lunes, Miércoles, Viernes)

  @Column({ type: 'time' })
  startTime: string; // Ejemplo: "08:00"

  @Column({ type: 'time' })
  endTime: string; // Ejemplo: "09:00"

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'enum', enum: RecurringEndType })
  endType: RecurringEndType;

  @Column({ type: 'date', nullable: true })
  endDate: Date; // Solo si endType es 'date'

  @Column({ type: 'int', nullable: true })
  maxOccurrences: number; // Solo si endType es 'count'

  @Column({ type: 'int', default: 0 })
  currentOccurrences: number; // Contador de reservas creadas

  @Column({ type: 'enum', enum: RecurringStatus, default: RecurringStatus.ACTIVE })
  status: RecurringStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'date', nullable: true })
  lastGeneratedDate: Date; // Última fecha para la que se generaron reservas

  @ManyToOne(() => User, user => user.recurringReservations, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Company, company => company.recurringReservations, { onDelete: 'CASCADE' })
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

