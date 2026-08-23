import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { BiomechanicalScreeningProtocol } from './biomechanical-screening-protocol.entity';
import { BiomechanicalScreeningTestResult } from './biomechanical-screening-test-result.entity';
import type { ScreeningProtocolDefinition } from '../modules/biomechanical-screening/protocol/stp-functional-screening.v1';
import type {
  PainAlert,
  ScreeningFinding,
  ScreeningFullReport,
  ScreeningSessionStatus,
  ScreeningSummaryReport,
} from '../modules/biomechanical-screening/screening.types';

@Entity('biomechanical_screening_session')
export class BiomechanicalScreeningSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.biomechanicalScreenings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'evaluator_id' })
  evaluator: User | null;

  @ManyToOne(() => BiomechanicalScreeningProtocol, (protocol) => protocol.sessions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'protocol_id' })
  protocol: BiomechanicalScreeningProtocol;

  @Column({ type: 'date', name: 'evaluation_date' })
  evaluationDate: Date;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ScreeningSessionStatus;

  @Column({ type: 'varchar', length: 80, name: 'current_test_code', nullable: true })
  currentTestCode: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', name: 'protocol_snapshot', nullable: true, default: () => 'null' })
  protocolSnapshot: ScreeningProtocolDefinition | null;

  @Column({ type: 'jsonb', name: 'summary_report', nullable: true, default: () => 'null' })
  summaryReport: ScreeningSummaryReport | null;

  @Column({ type: 'jsonb', name: 'full_report', nullable: true, default: () => 'null' })
  fullReport: ScreeningFullReport | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  findings: ScreeningFinding[];

  @Column({ type: 'jsonb', name: 'pain_alerts', default: () => "'[]'" })
  painAlerts: PainAlert[];

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => BiomechanicalScreeningTestResult, (test) => test.session, { cascade: true })
  tests: BiomechanicalScreeningTestResult[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
