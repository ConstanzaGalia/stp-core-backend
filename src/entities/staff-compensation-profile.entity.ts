import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Company } from './company.entity';
import { User } from './user.entity';

export enum StaffPayType {
  HOURLY = 'hourly',
  FIXED_MONTHLY = 'fixed_monthly',
  WEEKLY_HOURS_X4 = 'weekly_hours_x4',
}

@Entity('staff_compensation_profile')
@Unique(['companyId', 'userId'])
export class StaffCompensationProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: StaffPayType,
    default: StaffPayType.HOURLY,
    name: 'pay_type',
  })
  payType: StaffPayType;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, name: 'hourly_rate' })
  hourlyRate?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, name: 'fixed_monthly_amount' })
  fixedMonthlyAmount?: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'display_color' })
  displayColor?: string;

  @Column({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
