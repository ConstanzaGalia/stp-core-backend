import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PhysicalEvaluation } from './physical-evaluation.entity';

@Entity('physical_evaluation_test')
export class PhysicalEvaluationTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PhysicalEvaluation, (e) => e.tests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluation_id' })
  evaluation: PhysicalEvaluation;

  @Column({ type: 'varchar', length: 200, name: 'test_name' })
  testName: string;

  @Column({ type: 'varchar', length: 120, name: 'test_type' })
  testType: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics: Record<string, unknown>;
}
