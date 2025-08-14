import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('schedule_exception')
export class ScheduleException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  exceptionDate: Date; // Fecha específica de la excepción

  @Column({ nullable: true })
  startTime?: string; // Hora de inicio (null = cerrado todo el día)

  @Column({ nullable: true })
  endTime?: string; // Hora de fin (null = cerrado todo el día)

  @Column({ type: 'int', default: 0 })
  capacity: number; // Capacidad reducida para ese día

  @Column({ type: 'boolean', default: false })
  isClosed: boolean; // Si está completamente cerrado

  @Column({ nullable: true, length: 200 })
  reason: string; // Razón de la excepción (ej: "Feriado", "Mantenimiento")

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Si la excepción está activa

  @ManyToOne(() => Company, company => company.scheduleExceptions)
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
