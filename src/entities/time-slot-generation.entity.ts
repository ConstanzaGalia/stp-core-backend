import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { Company } from './company.entity';
import { Branch } from './branch.entity';

@Entity('time_slot_generation')
export class TimeSlotGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({ type: 'int' })
  totalDays: number;

  @Column({ type: 'int' })
  totalTimeSlots: number;

  @Column({ type: 'int' })
  daysWithConfig: number;

  @Column({ type: 'int', default: 0 })
  daysWithoutConfig: number;

  @ManyToOne(() => Company, company => company.timeSlotGenerations, { onDelete: 'CASCADE' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
