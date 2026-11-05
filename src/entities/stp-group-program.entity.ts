import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stp_group_programs')
@Index('idx_stp_group_program_company', ['companyId'])
@Index('idx_stp_group_program_company_status', ['companyId', 'status'])
export class STPGroupProgram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'short_name', type: 'varchar', length: 40, nullable: true })
  shortName: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, default: 'adaptacion' })
  phase: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'weeks_count', type: 'int', default: 4 })
  weeksCount: number;

  /** Sesiones por microciclo (2–5). Columnas Sesión 1…N en la grilla. */
  @Column({ name: 'sessions_per_week', type: 'int', default: 3 })
  sessionsPerWeek: number;

  /** Días sugeridos para el formulario de inscripción (Lun=0 … Dom=6). */
  @Column({ name: 'training_days', type: 'int', array: true, default: () => "'{0,2,4}'" })
  trainingDays: number[];

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName: string | null;

  @Column({ name: 'last_edited_by_user_id', type: 'uuid', nullable: true })
  lastEditedByUserId: string | null;

  @Column({ name: 'last_edited_by_name', type: 'text', nullable: true })
  lastEditedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
