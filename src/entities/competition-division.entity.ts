import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Competition } from './competition.entity';
import { Division } from './division.entity';

@Entity('competition_divisions')
@Unique(['competitionId', 'divisionId'])
export class CompetitionDivision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Competition, (competition) => competition.competitionDivisions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ name: 'competition_id' })
  competitionId: string;

  @ManyToOne(() => Division, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'division_id' })
  divisionId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
