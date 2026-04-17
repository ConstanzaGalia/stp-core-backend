import { Entity, PrimaryColumn, Column, Index, UpdateDateColumn } from 'typeorm';

/**
 * Weekly template keyed by (athlete_id, phase, week_type, weekly_frequency).
 * PK is a client-generated prefixed UUID (e.g. "weekly-template-<uuid>").
 */
@Entity('stp_weekly_templates')
@Index('idx_stp_weekly_template_lookup', ['athleteId', 'phase', 'weekType', 'weeklyFrequency'])
export class STPWeeklyTemplate {
  /** Client-generated id */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'athlete_id' })
  athleteId: string;

  @Column({ type: 'varchar', length: 50 })
  phase: string;

  @Column({ name: 'week_type', type: 'varchar', length: 20 })
  weekType: string;

  @Column({ name: 'weekly_frequency', default: 3 })
  weeklyFrequency: number;

  /** Array of WeeklyTemplateDay objects serialised as JSONB */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  days: unknown[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
