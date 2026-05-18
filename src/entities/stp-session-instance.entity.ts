import { Entity, PrimaryColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * A single generated training session instance.
 * PK is client-generated (e.g. "session-<uuid>").
 * Blocks, exercises, feedback and review are stored as JSONB blobs.
 */
@Entity('stp_session_instances')
@Index('idx_stp_session_athlete', ['athleteId'])
@Index('idx_stp_session_macro_week', ['athleteId', 'macroWeekId'])
export class STPSessionInstance {
  /** Client-generated id like "session-<uuid>" */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'athlete_id' })
  athleteId: string;

  @Column({ name: 'macro_plan_id', type: 'varchar', length: 100, nullable: true })
  macroPlanId: string | null;

  @Column({ name: 'macro_week_id', type: 'varchar', length: 100 })
  macroWeekId: string;

  @Column({ name: 'week_start_date', type: 'text' })
  weekStartDate: string;

  @Column({ name: 'week_label', type: 'text' })
  weekLabel: string;

  @Column({ name: 'session_ordinal', default: 1 })
  sessionOrdinal: number;

  @Column({ name: 'scheduled_date', type: 'text' })
  scheduledDate: string;

  @Column({ type: 'varchar', length: 50 })
  phase: string;

  @Column({ name: 'week_type', type: 'varchar', length: 20 })
  weekType: string;

  @Column({ type: 'varchar', length: 30 })
  pattern: string;

  @Column({ name: 'template_id', type: 'text' })
  templateId: string;

  @Column({ name: 'template_day_id', type: 'text' })
  templateDayId: string;

  /** Ej. amrap, tabata — sesiones fase resistencia */
  @Column({ name: 'endurance_format', type: 'varchar', length: 20, nullable: true })
  enduranceFormat: string | null;

  /** Variables de formato AMRAP/TABATA/NxN (serializado igual que el front) */
  @Column({ name: 'endurance_config', type: 'jsonb', nullable: true, default: () => 'null' })
  enduranceConfig: Record<string, unknown> | null;

  @Column({
    name: 'progression_config',
    type: 'jsonb',
    nullable: true,
    default: () => 'null',
  })
  progressionConfig: unknown | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  warnings: string[];

  /** Array of SessionBlock (each with nested SessionExercise[]) as JSONB */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  blocks: unknown[];

  @Column({
    name: 'feedback_status',
    type: 'varchar',
    length: 30,
    default: 'none',
  })
  feedbackStatus: string;

  @Column({ type: 'jsonb', nullable: true, default: () => 'null' })
  feedback: unknown | null;

  @Column({ type: 'jsonb', nullable: true, default: () => 'null' })
  review: unknown | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
