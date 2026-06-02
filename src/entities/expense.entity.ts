import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Company } from './company.entity';
import { FixedExpenseTemplate } from './fixed-expense-template.entity';

@Entity('expense')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => FixedExpenseTemplate, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'fixedExpenseTemplateId' })
  fixedExpenseTemplate?: FixedExpenseTemplate;

  @CreateDateColumn()
  createdAt: Date;
}
