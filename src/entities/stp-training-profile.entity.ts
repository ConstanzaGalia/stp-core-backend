import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('stp_training_profiles')
export class STPTrainingProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** One profile per athlete — enforced by unique constraint */
  @Column({ name: 'athlete_id', unique: true })
  athleteId: string;

  @Column({ name: 'weekly_frequency', default: 3 })
  weeklyFrequency: number;

  @Column({ type: 'text', nullable: true, default: '' })
  goal: string;

  @Column({ name: 'target_date', type: 'text', nullable: true })
  targetDate: string | null;

  @Column({ name: 'training_max_score', type: 'float', default: 3 })
  trainingMaxScore: number;

  @Column({
    name: 'available_equipment',
    type: 'jsonb',
    nullable: true,
    default: () => "'[]'",
  })
  availableEquipment: string[];

  @Column({
    name: 'default_progression_config',
    type: 'jsonb',
    nullable: true,
    default: () => 'null',
  })
  defaultProgressionConfig: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
