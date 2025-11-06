import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { PaymentPlan } from './payment-plan.entity';
import { Payment } from './payment.entity';
import { ClassUsage } from './class-usage.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

@Entity('user_payment_subscriptions')
export class UserPaymentSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ type: 'date' })
  startDate: Date; // Fecha de inicio de la suscripción

  @Column({ type: 'date', nullable: true })
  endDate: Date; // Fecha de fin (si no es recurrente)

  @Column({ type: 'date', nullable: true })
  nextBillingDate: Date; // Próxima fecha de facturación

  @Column({ type: 'int', default: 0 })
  totalInstallments: number; // Total de cuotas del plan

  @Column({ type: 'int', default: 0 })
  paidInstallments: number; // Cuotas pagadas

  @Column({ type: 'int', default: 0 })
  pendingInstallments: number; // Cuotas pendientes

  @Column({ type: 'int', default: 0 })
  classesUsedThisPeriod: number; // Clases usadas en el período actual

  @Column({ type: 'int', default: 0 })
  classesRemainingThisPeriod: number; // Clases restantes en el período

  @Column({ type: 'date', nullable: true })
  weekStartDate: Date; // Fecha de inicio de la semana actual (lunes)

  @Column({ type: 'int', default: 0 })
  classesUsedThisWeek: number; // Clases usadas esta semana

  @Column({ type: 'int', default: 0 })
  classesRemainingThisWeek: number; // Clases restantes esta semana

  @Column({ type: 'date' })
  periodStartDate: Date; // Fecha de inicio del período (cuando se paga)

  @Column({ type: 'date' })
  periodEndDate: Date; // Fecha de fin del período (30 días después)

  @Column({ type: 'boolean', default: false })
  autoRenew: boolean; // Si se renueva automáticamente

  @Column({ type: 'text', nullable: true })
  notes: string; // Notas sobre la suscripción

  @ManyToOne(() => User, user => user.paymentSubscriptions)
  user: User;

  @ManyToOne(() => Company, company => company.userPaymentSubscriptions)
  company: Company;

  @ManyToOne(() => PaymentPlan, paymentPlan => paymentPlan.userSubscriptions)
  paymentPlan: PaymentPlan;

  @OneToMany(() => Payment, payment => payment.subscription)
  payments: Payment[];

  @OneToMany(() => ClassUsage, classUsage => classUsage.subscription)
  classUsages: ClassUsage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
