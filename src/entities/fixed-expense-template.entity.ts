import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Company } from './company.entity';
import { FixedExpenseMonthStatus } from './fixed-expense-month-status.entity';

@Entity('fixed_expense_template')
export class FixedExpenseTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'default_category' })
  defaultCategory?: string;

  @Column({ type: 'varchar', length: 3, default: 'ARS', name: 'default_currency' })
  defaultCurrency: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @OneToMany(() => FixedExpenseMonthStatus, (status) => status.template)
  monthStatuses: FixedExpenseMonthStatus[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
