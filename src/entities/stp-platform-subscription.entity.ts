import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { User } from './user.entity';
import { StpPlatformCharge } from './stp-platform-charge.entity';
import {
  StpPlatformBillingKind,
  StpPlatformPlan,
  StpPlatformSubscriptionStatus,
} from '../common/enums/enums';

@Entity('stp_platform_subscriptions')
@Index(['companyId', 'status'])
@Index(['periodEnd'])
export class StpPlatformSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'enum', enum: StpPlatformPlan })
  plan: StpPlatformPlan;

  @Column({
    type: 'enum',
    enum: StpPlatformBillingKind,
    name: 'billing_kind',
  })
  billingKind: StpPlatformBillingKind;

  @Column({
    type: 'enum',
    enum: StpPlatformSubscriptionStatus,
    default: StpPlatformSubscriptionStatus.ACTIVE,
  })
  status: StpPlatformSubscriptionStatus;

  /** Precio pactado del período; null si FREE. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'subscription_amount',
  })
  subscriptionAmount: number | null;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'date', name: 'period_start' })
  periodStart: string;

  /** Vencimiento para cobro manual; null si FREE o sin fecha. */
  @Column({ type: 'date', nullable: true, name: 'period_end' })
  periodEnd: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_by_user_id' })
  assignedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_by_user_id' })
  assignedBy: User | null;

  @OneToMany(() => StpPlatformCharge, (c) => c.subscription)
  charges: StpPlatformCharge[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
