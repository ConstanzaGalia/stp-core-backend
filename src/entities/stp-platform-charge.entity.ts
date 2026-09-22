import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { User } from './user.entity';
import { StpPlatformSubscription } from './stp-platform-subscription.entity';
import {
  StpPlatformChargeConcept,
  StpPlatformChargeStatus,
  StpPlatformPaymentMethod,
} from '../common/enums/enums';

@Entity('stp_platform_charges')
@Index(['companyId', 'status'])
@Index(['companyId', 'concept'])
@Index(['dueDate'])
export class StpPlatformCharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid', nullable: true, name: 'subscription_id' })
  subscriptionId: string | null;

  @ManyToOne(() => StpPlatformSubscription, (s) => s.charges, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'subscription_id' })
  subscription: StpPlatformSubscription | null;

  @Column({ type: 'enum', enum: StpPlatformChargeConcept })
  concept: StpPlatformChargeConcept;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @Column({
    type: 'enum',
    enum: StpPlatformChargeStatus,
    default: StpPlatformChargeStatus.PENDING,
  })
  status: StpPlatformChargeStatus;

  @Column({ type: 'date', nullable: true, name: 'due_date' })
  dueDate: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'paid_at' })
  paidAt: Date | null;

  @Column({
    type: 'enum',
    enum: StpPlatformPaymentMethod,
    nullable: true,
  })
  method: StpPlatformPaymentMethod | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'recorded_by_user_id' })
  recordedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recorded_by_user_id' })
  recordedBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
