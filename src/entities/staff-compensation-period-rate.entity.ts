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
import { StaffPayType } from './staff-compensation-profile.entity';

/** Tarifa de compensación vigente para un mes concreto (histórico por período). */
@Entity('staff_compensation_period_rate')
@Unique(['companyId', 'userId', 'year', 'month'])
export class StaffCompensationPeriodRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({
    type: 'enum',
    enum: StaffPayType,
    default: StaffPayType.HOURLY,
    name: 'pay_type',
  })
  payType: StaffPayType;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, name: 'hourly_rate' })
  hourlyRate?: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'fixed_monthly_amount',
  })
  fixedMonthlyAmount?: string;

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
