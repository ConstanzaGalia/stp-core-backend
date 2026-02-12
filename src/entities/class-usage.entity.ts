import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { UserPaymentSubscription } from './user-payment-subscription.entity';

export enum ClassUsageType {
  RESERVATION = 'reservation',
  WALK_IN = 'walk_in',
  SPECIAL_CLASS = 'special_class'
}

@Entity('class_usage')
export class ClassUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ClassUsageType, default: ClassUsageType.RESERVATION })
  type: ClassUsageType;

  @Column({ type: 'date' })
  usageDate: Date; // Fecha en que se usó la clase

  @Column({ type: 'text', nullable: true })
  notes: string; // Notas sobre la clase

  @Column({ type: 'boolean', default: false })
  isExpired: boolean; // Si la clase expiró sin usar

  @ManyToOne(() => User, user => user.classUsages, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Company, company => company.classUsages, { onDelete: 'CASCADE' })
  company: Company;

  @ManyToOne(() => UserPaymentSubscription, subscription => subscription.classUsages)
  subscription: UserPaymentSubscription;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
