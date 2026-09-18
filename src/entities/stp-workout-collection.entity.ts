import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Colecciones (carpetas) de workouts compartidas por centro.
 * Un workout pertenece a una sola colección (o a ninguna).
 */
@Entity('stp_workout_collections')
@Index('idx_stp_workout_collection_company', ['companyId'])
@Index('idx_stp_workout_collection_company_active', ['companyId', 'isActive'])
@Index('idx_stp_workout_collection_company_sort', ['companyId', 'sortOrder'])
export class STPWorkoutCollection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

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
