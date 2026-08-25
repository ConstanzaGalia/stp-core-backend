import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Competition } from './competition.entity';
import { CompetitionParticipantMatch } from './competition-participant-match.entity';
import { Division } from './division.entity';
import { User } from './user.entity';

@Entity('competition_participants')
@Unique(['competitionId', 'userId'])
export class CompetitionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Competition, (competition) => competition.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ name: 'competition_id' })
  competitionId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  /** División del jugador al momento de la convocatoria (snapshot). */
  @ManyToOne(() => Division, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  /** Resultado individual del jugador en esta competencia. */
  @Column({ name: 'result_summary', type: 'text', nullable: true })
  resultSummary: string | null;

  @OneToMany(() => CompetitionParticipantMatch, (match) => match.participant, {
    cascade: true,
  })
  matches: CompetitionParticipantMatch[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
