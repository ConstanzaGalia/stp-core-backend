import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { PhysicalEvaluationTest } from './physical-evaluation-test.entity';

export type PhysicalEvaluationProcessingStatus = 'pending' | 'processing' | 'ready' | 'error';

export type AiAnalysisStatus = 'pending' | 'processing' | 'ready' | 'error';

export type PerformanceLevel = 'amateur' | 'semi-professional' | 'professional' | 'elite';

export interface AthleteContext {
  sport: string | null;
  discipline: string | null;
  level: PerformanceLevel | null;
  injuries: string[];
  conditions: string[];
  notes: string | null;
}

export interface AiCapacityCategory {
  score: number | null;
  narrative: string;
}

export interface AiKeyFinding {
  severity: 'critical' | 'warning' | 'positive';
  title: string;
  body: string;
  metric?: string;
  value?: number;
  unit?: string;
}

export interface AiTrainingRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  rationale: string;
  exercises: string[];
  timeframe: string;
}

export interface AiRetestItem {
  testType: string;
  interval: string;
  targetMetric?: string;
  targetValue?: string;
}

export interface AiRiskFlag {
  area: string;
  description: string;
  urgency: 'immediate' | 'moderate' | 'monitoring';
}

export interface AiAnalysis {
  version: string;
  model: string;
  generatedAt: string;
  athleteContext: AthleteContext | null;
  executiveSummary: string;
  overallScore: number | null;
  overallLevel: 'low' | 'medium' | 'high' | null;
  capacityProfile: {
    potencia: AiCapacityCategory;
    reactividad: AiCapacityCategory;
    fuerza: AiCapacityCategory;
    asimetria: AiCapacityCategory;
    resistencia: AiCapacityCategory;
    estrategia: AiCapacityCategory;
  };
  keyFindings: AiKeyFinding[];
  trainingRecommendations: AiTrainingRecommendation[];
  retestSchedule: AiRetestItem[];
  riskFlags: AiRiskFlag[];
  sportSpecificNotes: string | null;
}

export interface PhysicalEvaluationFileMeta {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  size: number | null;
  uploadedAt: string | null;
  status: PhysicalEvaluationProcessingStatus | string;
  storageKey: string | null;
  downloadUrl: string | null;
  signedUrl: string | null;
  localRelativePath: string | null;
  testType: string | null;
  detectedTestType: string | null;
  parserFormat: string | null;
  warnings: string[];
  errorMessage: string | null;
  preview: Record<string, unknown> | null;
}

@Entity('physical_evaluation')
export class PhysicalEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.physicalEvaluations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date', name: 'evaluation_date' })
  evaluationDate: Date;

  @Column({ type: 'float', name: 'summary_score', nullable: true })
  summaryScore: number | null;

  @Column({ type: 'text', name: 'summary_analysis', nullable: true })
  summaryAnalysis: string | null;

  @Column({ type: 'jsonb', name: 'structured_analysis', nullable: true, default: () => 'null' })
  structuredAnalysis: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, name: 'processing_status', default: 'pending' })
  processingStatus: PhysicalEvaluationProcessingStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  files: PhysicalEvaluationFileMeta[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings: string[];

  @Column({ type: 'float', nullable: true })
  completeness: number | null;

  @Column({ type: 'jsonb', name: 'athlete_context', nullable: true, default: () => 'null' })
  athleteContext: AthleteContext | null;

  @Column({ type: 'jsonb', name: 'ai_analysis', nullable: true, default: () => 'null' })
  aiAnalysis: AiAnalysis | null;

  @Column({ type: 'varchar', length: 20, name: 'ai_analysis_status', nullable: true, default: () => 'null' })
  aiAnalysisStatus: AiAnalysisStatus | null;

  @Column({ type: 'text', name: 'ai_analysis_error', nullable: true, default: () => 'null' })
  aiAnalysisError: string | null;

  @OneToMany(() => PhysicalEvaluationTest, (t) => t.evaluation, { cascade: true })
  tests: PhysicalEvaluationTest[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
