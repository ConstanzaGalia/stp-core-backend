import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
} from 'typeorm';

@Entity('stp_group_program_enrollments')
@Index('idx_stp_group_program_enrollment_program', ['programId', 'status'])
@Index('idx_stp_group_program_enrollment_athlete', ['athleteId', 'status'])
@Unique('uq_stp_group_program_enrollment', ['programId', 'athleteId'])
export class STPGroupProgramEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ name: 'athlete_id', type: 'uuid' })
  athleteId: string;

  @Column({ name: 'start_week_index', type: 'int', default: 1 })
  startWeekIndex: number;

  /** Días de asistencia del alumno (Lun=0 … Dom=6). Sesión k → trainingDays[k-1]. */
  @Column({ name: 'training_days', type: 'int', array: true, default: () => "'{}'" })
  trainingDays: number[];

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'enrolled_at' })
  enrolledAt: Date;
}
