import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';

@Entity('stp_group_program_slots')
@Index('idx_stp_group_program_slot_program', ['programId', 'weekIndex'])
@Unique('uq_stp_group_program_slot_week_ordinal', [
  'programId',
  'weekIndex',
  'sessionOrdinal',
])
export class STPGroupProgramSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ name: 'week_index', type: 'int' })
  weekIndex: number;

  /** Legacy; nullable. El calendario usa días del enrollment. */
  @Column({ name: 'day_of_week', type: 'int', nullable: true })
  dayOfWeek: number | null;

  @Column({ name: 'session_ordinal', type: 'int', default: 1 })
  sessionOrdinal: number;

  @Column({ name: 'workout_template_id', type: 'uuid' })
  workoutTemplateId: string;

  @Column({ name: 'week_type', type: 'varchar', length: 20, default: 'carga' })
  weekType: string;

  @Column({ name: 'prescription_overrides', type: 'jsonb', nullable: true })
  prescriptionOverrides: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
