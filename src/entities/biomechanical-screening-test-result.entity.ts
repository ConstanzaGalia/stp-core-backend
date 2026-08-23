import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { BiomechanicalScreeningSession } from './biomechanical-screening-session.entity';
import type { ScreeningClassification } from '../modules/biomechanical-screening/protocol/stp-functional-screening.v1';
import type {
  CriterionObservation,
  LandingAttemptsMeta,
  ScreeningQuantitativeValues,
  ScreeningTestStatus,
  SideQualitativeResult,
  SideQuantitativeResult,
} from '../modules/biomechanical-screening/screening.types';

@Entity('biomechanical_screening_test_result')
@Unique(['session', 'testCode'])
export class BiomechanicalScreeningTestResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BiomechanicalScreeningSession, (session) => session.tests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: BiomechanicalScreeningSession;

  @Column({ type: 'varchar', length: 80, name: 'test_code' })
  testCode: string;

  @Column({ type: 'int', name: 'sort_order' })
  sortOrder: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ScreeningTestStatus;

  @Column({ type: 'jsonb', nullable: true, default: () => 'null' })
  quantitative: ScreeningQuantitativeValues | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  observations: Record<string, CriterionObservation>;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  compensations: string[];

  @Column({ type: 'varchar', length: 80, name: 'primary_compensation', nullable: true })
  primaryCompensation: string | null;

  @Column({ type: 'jsonb', name: 'side_results', nullable: true, default: () => 'null' })
  sideResults: {
    left?: SideQualitativeResult | SideQuantitativeResult;
    right?: SideQualitativeResult | SideQuantitativeResult;
  } | null;

  @Column({ type: 'jsonb', nullable: true, default: () => 'null' })
  attempts: LandingAttemptsMeta | null;

  @Column({ type: 'varchar', length: 500, name: 'video_url', nullable: true })
  videoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'float', nullable: true })
  score: number | null;

  @Column({ type: 'float', name: 'max_score', nullable: true })
  maxScore: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  classification: ScreeningClassification | null;

  @Column({ type: 'boolean', name: 'has_pain', default: false })
  hasPain: boolean;

  @Column({ type: 'text', array: true, name: 'invalid_reasons', default: () => "'{}'" })
  invalidReasons: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
