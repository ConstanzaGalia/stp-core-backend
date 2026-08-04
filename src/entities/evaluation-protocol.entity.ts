import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type EvaluationDevice =
  | 'force_platform'
  | 'photocells'
  | 'gps'
  | 'linear_encoder'
  | 'dynamometer'
  | 'lab'
  | 'manual';

export type EvaluationProtocolCategory = 'speed' | 'agility' | 'resistance' | string;

@Entity('evaluation_protocol')
export class EvaluationProtocol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  device: EvaluationDevice | string;

  @Column({ type: 'varchar', length: 40 })
  category: EvaluationProtocolCategory;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
