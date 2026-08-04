import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PhysicalEvaluation } from './physical-evaluation.entity';

@Entity('physical_evaluation_measurement')
export class PhysicalEvaluationMeasurement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PhysicalEvaluation, (e) => e.measurements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: PhysicalEvaluation;

  @Column({ type: 'int', nullable: true })
  partial: number | null;

  @Column({ type: 'float', nullable: true })
  distance: number | null;

  @Column({ type: 'float', nullable: true })
  time: number | null;

  @Column({ type: 'float', nullable: true })
  velocity: number | null;

  @Column({ type: 'float', nullable: true })
  acceleration: number | null;

  @Column({ type: 'float', nullable: true })
  power: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  extras: Record<string, unknown>;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder: number;
}
