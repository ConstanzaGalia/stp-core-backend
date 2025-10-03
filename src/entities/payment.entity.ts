import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { PaymentPlan } from './payment-plan.entity';
import { UserPaymentSubscription } from './user-payment-subscription.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  OTHER = 'other'
}

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Monto base

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lateFee: number; // Recargo por mora

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number; // Descuento aplicado

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number; // Monto total (amount + lateFee - discount)

  @Column({ 
    type: 'enum', 
    enum: PaymentStatus, 
    default: PaymentStatus.PENDING 
  })
  status: PaymentStatus;

  @Column({ 
    type: 'enum', 
    enum: PaymentMethod, 
    nullable: true 
  })
  paymentMethod: PaymentMethod;

  @Column({ type: 'date', nullable: true })
  dueDate: Date; // Fecha de vencimiento

  @Column({ type: 'timestamp', nullable: true })
  paidDate: Date; // Fecha de pago real

  @Column({ type: 'int', default: 1 })
  instalmentNumber: number; // Número de cuota

  @Column({ type: 'text', nullable: true })
  notes: string; // Notas adicionales

  @Column({ type: 'varchar', nullable: true })
  transactionId: string; // ID de transacción del gateway de pago

  // Relaciones
  @ManyToOne(() => User, user => user.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Company, company => company.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => PaymentPlan, paymentPlan => paymentPlan.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentPlanId' })
  paymentPlan: PaymentPlan;

  @ManyToOne(() => UserPaymentSubscription, subscription => subscription.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: UserPaymentSubscription;
}
