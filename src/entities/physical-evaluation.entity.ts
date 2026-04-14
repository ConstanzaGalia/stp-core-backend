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

  @OneToMany(() => PhysicalEvaluationTest, (t) => t.evaluation, { cascade: true })
  tests: PhysicalEvaluationTest[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
