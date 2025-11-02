import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserPaymentSubscription } from './user-payment-subscription.entity';
import { User } from './user.entity';
import { Company } from './company.entity';

@Entity('subscription_suspensions')
export class SubscriptionSuspension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  startDate: Date; // Fecha de inicio de la suspensión

  @Column({ type: 'date' })
  endDate: Date; // Fecha de fin de la suspensión

  @Column({ type: 'text', nullable: true })
  reason: string; // Razón de la suspensión

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Si la suspensión está activa

  @Column({ type: 'text', nullable: true })
  notes: string; // Notas adicionales

  @ManyToOne(() => UserPaymentSubscription, subscription => subscription.id, { onDelete: 'CASCADE', nullable: true })
  subscription: UserPaymentSubscription;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

