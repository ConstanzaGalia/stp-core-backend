import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Company } from './company.entity';
import { Payment } from './payment.entity';
import { UserPaymentSubscription } from './user-payment-subscription.entity';

@Entity('payment_plans')
export class PaymentPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // "Plan 2x Semana", "Plan 3x Semana", etc.

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Monto mensual

  @Column({ type: 'int', default: 30 })
  frequencyDays: number; // Siempre 30 días (mensual)

  @Column({ type: 'int', default: 1 })
  totalInstallments: number; // Siempre 1 (mensual)

  @Column({ type: 'int' })
  classesPerWeek: number; // 1, 2, 3, 4 o 5 clases por semana

  @Column({ type: 'int' })
  maxClassesPerPeriod: number; // Máximo total de clases en el período (ej: 12 para 3x semana en 30 días)

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: true })
  isRecurring: boolean; // Siempre true para renovación mensual

  @Column({ type: 'int', default: 0 })
  gracePeriodDays: number; // Días de gracia para pagar la cuota

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  lateFeePercentage: number; // Recargo por mora en el pago

  @Column({ type: 'boolean', default: true })
  allowClassRollover: boolean; // Si las clases no usadas pasan al siguiente mes

  @Column({ type: 'int', default: 0 })
  maxRolloverClasses: number; // Máximo de clases que pueden pasar al siguiente mes

  @ManyToOne(() => Company, company => company.paymentPlans)
  company: Company;

  @OneToMany(() => Payment, payment => payment.paymentPlan)
  payments: Payment[];

  @OneToMany(() => UserPaymentSubscription, subscription => subscription.paymentPlan)
  userSubscriptions: UserPaymentSubscription[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
