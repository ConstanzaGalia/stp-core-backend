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
import { Company } from './company.entity';
import { CompetitionDivision } from './competition-division.entity';
import { CompetitionMatch } from './competition-match.entity';
import { CompetitionParticipant } from './competition-participant.entity';

export enum CompetitionDateType {
  SINGLE_DATE = 'single_date',
  DATE_RANGE = 'date_range',
}

export enum CompetitionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('competitions')
export class Competition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 100 })
  sport: string;

  @Column({
    type: 'enum',
    enum: CompetitionDateType,
    name: 'date_type',
  })
  dateType: CompetitionDateType;

  @Column({ type: 'date', nullable: true, name: 'target_date' })
  targetDate: Date | null;

  @Column({ type: 'date', nullable: true, name: 'start_date' })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true, name: 'end_date' })
  endDate: Date | null;

  @Column({ length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: CompetitionStatus,
    default: CompetitionStatus.PLANNED,
  })
  status: CompetitionStatus;

  @Column({ type: 'text', nullable: true, name: 'result_summary' })
  resultSummary: string | null;

  @OneToMany(() => CompetitionDivision, (row) => row.competition, {
    cascade: true,
  })
  competitionDivisions: CompetitionDivision[];

  @OneToMany(() => CompetitionParticipant, (row) => row.competition, {
    cascade: true,
  })
  participants: CompetitionParticipant[];

  @OneToMany(() => CompetitionMatch, (row) => row.competition, {
    cascade: true,
  })
  matches: CompetitionMatch[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
