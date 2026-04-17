import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * One macro plan per athlete (latest wins).
 * PK is a client-generated prefixed UUID (e.g. "macro-plan-<uuid>").
 */
@Entity('stp_macro_plans')
export class STPMacroPlan {
  /** Client-generated id like "macro-plan-<uuid>" */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'athlete_id' })
  athleteId: string;

  @Column({ type: 'text', nullable: true, default: '' })
  goal: string;

  @Column({ name: 'target_date', type: 'text', nullable: true })
  targetDate: string | null;

  @Column({ type: 'text', nullable: true, default: '' })
  level: string;

  @Column({ name: 'weekly_frequency', default: 3 })
  weeklyFrequency: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  /** Array of MacroWeek objects serialised as JSONB */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  weeks: unknown[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
