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
import { FixedExpenseTemplate } from './fixed-expense-template.entity';
import { Expense } from './expense.entity';

export enum FixedExpenseMonthStatusValue {
  PENDING = 'pending',
  PAID = 'paid',
  NA = 'na',
  NO = 'no',
}

export enum FixedExpenseMonthSource {
  MANUAL = 'manual',
  EXPENSE = 'expense',
}

@Entity('fixed_expense_month_status')
@Unique(['company', 'template', 'year', 'month'])
export class FixedExpenseMonthStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({
    type: 'enum',
    enum: FixedExpenseMonthStatusValue,
    default: FixedExpenseMonthStatusValue.PENDING,
  })
  status: FixedExpenseMonthStatusValue;

  @Column({
    type: 'enum',
    enum: FixedExpenseMonthSource,
    nullable: true,
  })
  source?: FixedExpenseMonthSource;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => FixedExpenseTemplate, (template) => template.monthStatuses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'templateId' })
  template: FixedExpenseTemplate;

  @ManyToOne(() => Expense, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'expenseId' })
  expense?: Expense;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
