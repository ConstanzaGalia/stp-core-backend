import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Competition } from './competition.entity';

export enum AthleteObjectiveType {
  SINGLE_DATE = 'single_date',
  DATE_RANGE = 'date_range',
  ANNUAL = 'annual',
}

@Entity('athlete_objective')
export class AthleteObjective {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.athleteObjectives, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: AthleteObjectiveType })
  type: AthleteObjectiveType;

  /** Fecha puntual (carrera, competencia). */
  @Column({ type: 'date', nullable: true, name: 'target_date' })
  targetDate: Date | null;

  /** Inicio de rango (campamento, torneo). */
  @Column({ type: 'date', nullable: true, name: 'start_date' })
  startDate: Date | null;

  /** Fin de rango. */
  @Column({ type: 'date', nullable: true, name: 'end_date' })
  endDate: Date | null;

  /** Objetivo generado automáticamente desde una competencia del club. */
  @ManyToOne(() => Competition, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition | null;

  @Column({ name: 'competition_id', type: 'uuid', nullable: true })
  competitionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
