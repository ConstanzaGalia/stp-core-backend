import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PhysicalEvaluation } from './physical-evaluation.entity';
import type { RepDecisionEntry, TestRepEvaluation } from 'src/modules/physical-evaluation/rep-rules/rep-metric-specs';

export interface PhysicalEvaluationAggregateStats {
  best: number | null;
  mean: number | null;
  worst: number | null;
}

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

  @Column({ type: 'varchar', length: 120, name: 'source_file_id', nullable: true })
  sourceFileId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  repetitions: Array<Record<string, unknown>>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  aggregates: Record<string, PhysicalEvaluationAggregateStats | number | null>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings: string[];

  /** Registro append-only de decisiones del entrenador sobre repeticiones (ver sql/add-physical-evaluation-test-rep-decisions.sql). */
  @Column({ type: 'jsonb', name: 'repetition_decisions', default: () => "'[]'" })
  repetitionDecisions: RepDecisionEntry[];

  /** Calculado al leer con las reglas vigentes; no se persiste. */
  repSummary?: TestRepEvaluation | null;

  /** Métricas con el valor que dejan las reglas de repeticiones; calculadas al leer, no se persisten. */
  effectiveMetrics?: Record<string, unknown>;
}
