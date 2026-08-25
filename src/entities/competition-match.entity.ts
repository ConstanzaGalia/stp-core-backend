import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Competition } from './competition.entity';

@Entity('competition_matches')
export class CompetitionMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Competition, (competition) => competition.matches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ name: 'competition_id' })
  competitionId: string;

  @Column({ type: 'date', nullable: true, name: 'played_at' })
  playedAt: Date | null;

  @Column({ length: 100, nullable: true, name: 'round_label' })
  roundLabel: string | null;

  @Column({ length: 200, nullable: true })
  opponent: string | null;

  @Column({ type: 'text', name: 'result_summary' })
  resultSummary: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
