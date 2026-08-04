import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Umbral por variable canónica (CMJ resumido / informe). */
export interface CriteriaThreshold {
  greenMin?: number;
  yellowMin?: number;
  greenMax?: number;
  yellowMax?: number;
  unit?: string;
  direction?: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_RANGE';
  higherIsBetter?: boolean;
  useAbs?: boolean;
  messages?: {
    green?: string | string[];
    yellow?: string | string[];
    red?: string | string[];
  };
}

export type CriteriaThresholds = Record<string, CriteriaThreshold>;

@Entity('evaluation_criteria_set')
export class EvaluationCriteriaSet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sport: string | null;

  @Column({ type: 'varchar', length: 80, name: 'age_group', nullable: true })
  ageGroup: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  sex: string | null;

  @Index()
  @Column({ type: 'varchar', length: 40, name: 'test_type', default: 'cmj' })
  testType: string;

  @Index()
  @Column({ type: 'varchar', length: 80, name: 'protocol_code', nullable: true })
  protocolCode: string | null;

  @Column({ type: 'varchar', length: 30, default: '1.0' })
  version: string;

  @Column({ type: 'date', name: 'effective_from', nullable: true })
  effectiveFrom: Date | null;

  @Column({ type: 'date', name: 'effective_to', nullable: true })
  effectiveTo: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: 'manual' | 'historical';

  @Column({ type: 'int', name: 'sample_size', nullable: true })
  sampleSize: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  thresholds: CriteriaThresholds;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
