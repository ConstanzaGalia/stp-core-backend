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

  @Column({ type: 'boolean', default: false })
  allowIntermediateSlots: boolean; // Permite turnos intermedios/superpuestos

  @Column({ type: 'int', nullable: true })
  intermediateCapacity: number; // Capacidad para turnos intermedios (ej: 30 min)

  @Column({ type: 'int', default: 60 })
  slotDurationMinutes: number; // Duración de cada turno principal en minutos

  @Column({ type: 'int', default: 30, nullable: true })
  intermediateSlotDurationMinutes: number; // Duración de turnos intermedios en minutos

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => Company, company => company.scheduleConfigs, { onDelete: 'CASCADE' })
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 