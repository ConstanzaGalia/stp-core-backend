import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('schedule_config')
export class ScheduleConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  @Column()
  startTime: string; // Formato "HH:MM"

  @Column()
  endTime: string; // Formato "HH:MM"

  @Column({ type: 'int', default: 1 })
  capacity: number; // Capacidad por hora

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => Company, company => company.scheduleConfigs)
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 