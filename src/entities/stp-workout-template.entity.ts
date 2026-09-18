import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Biblioteca compartida de workouts (sesiones tipo) por centro.
 * Los blocks usan el mismo contrato JSONB que SessionInstance (SessionBlock[]).
 */
@Entity('stp_workout_templates')
@Index('idx_stp_workout_template_company', ['companyId'])
@Index('idx_stp_workout_template_company_active', ['companyId', 'isActive'])
@Index('idx_stp_workout_template_company_sort', ['companyId', 'sortOrder'])
export class STPWorkoutTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phase: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  pattern: string | null;

  /** Colección (carpeta) del centro; null = sin colección. */
  @Column({ name: 'collection_id', type: 'uuid', nullable: true })
  collectionId: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** SessionBlock[] sin feedback */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  blocks: unknown[];

  @Column({ name: 'endurance_format', type: 'varchar', length: 20, nullable: true })
  enduranceFormat: string | null;

  @Column({ name: 'endurance_config', type: 'jsonb', nullable: true, default: () => 'null' })
  enduranceConfig: Record<string, unknown> | null;

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
