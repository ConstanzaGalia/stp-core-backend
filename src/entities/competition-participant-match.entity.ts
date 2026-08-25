import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompetitionParticipant } from './competition-participant.entity';

@Entity('competition_participant_matches')
export class CompetitionParticipantMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompetitionParticipant, (participant) => participant.matches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'participant_id' })
  participant: CompetitionParticipant;

  @Column({ name: 'participant_id' })
  participantId: string;

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
