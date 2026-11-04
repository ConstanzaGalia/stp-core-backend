import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Division } from './division.entity';
import { User } from './user.entity';

export type GroupPlanObjective = 'fuerza' | 'carrera';

export type GroupPlanGroup = {
  id: string;
  name: string;
  athleteIds: string[];
};

/**
 * Armado de grupos de una división (fuerza o carrera) a partir de las evaluaciones.
 * `criteria` guarda la configuración con la que se propuso (para poder reabrirla);
 * `groups` es lo que el entrenador dejó finalmente, incluidos los movimientos manuales.
 */
@Entity('division_group_plans')
export class DivisionGroupPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Division, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'division_id' })
  divisionId: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  objective: GroupPlanObjective;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  criteria: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  groups: GroupPlanGroup[];

  /** Atletas que quedaron sin grupo (sin datos para agrupar o sin asignar). */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  unassigned: string[];

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
