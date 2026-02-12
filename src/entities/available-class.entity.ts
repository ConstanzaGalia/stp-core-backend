import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { UserPaymentSubscription } from './user-payment-subscription.entity';
import { Payment } from './payment.entity';
import { Reservation } from './reservation.entity';

export enum AvailableClassReason {
  NO_CAPACITY = 'no_capacity',
  MISSING_TIME_SLOT = 'missing_time_slot',
  CANNOT_BOOK = 'cannot_book'
}

export enum AvailableClassStatus {
  AVAILABLE = 'available',
  USED = 'used',
  EXPIRED = 'expired'
}

@Entity('available_classes')
export class AvailableClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  intendedDate: Date; // Fecha en que debería haberse reservado la clase

  @Column({ type: 'enum', enum: AvailableClassReason })
  reason: AvailableClassReason; // Razón por la que no se pudo reservar automáticamente

  @Column({ type: 'enum', enum: AvailableClassStatus, default: AvailableClassStatus.AVAILABLE })
  status: AvailableClassStatus;

  @Column({ type: 'date' })
  expiresAt: Date; // Fecha de vencimiento (periodEndDate del pago)

  @Column({ type: 'date', nullable: true })
  usedAt: Date; // Fecha en que se usó la clase disponible

  @Column({ type: 'text', nullable: true })
  notes: string; // Notas adicionales

  @ManyToOne(() => User, user => user.availableClasses, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Company, company => company.availableClasses, { onDelete: 'CASCADE' })
  company: Company;

  @ManyToOne(() => UserPaymentSubscription, subscription => subscription.availableClasses)
  subscription: UserPaymentSubscription;

  @ManyToOne(() => Payment, payment => payment.availableClasses, { nullable: true })
  payment: Payment; // Pago que generó esta clase disponible

  @OneToOne(() => Reservation, reservation => reservation.availableClass, { nullable: true })
  @JoinColumn()
  reservation: Reservation; // Reserva que usó esta clase disponible

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

