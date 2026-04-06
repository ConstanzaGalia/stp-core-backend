import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('athlete_evaluation')
export class AthleteEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.evaluations, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'int' })
  experiencia: number;

  @Column({ type: 'int', name: 'control_motor' })
  controlMotor: number;

  @Column({ type: 'int', name: 'capacidad_estructural' })
  capacidadEstructural: number;

  @Column({ type: 'float', name: 'score_total' })
  scoreTotal: number;

  @Column({ type: 'int', name: 'stp_level' })
  stpLevel: number;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @CreateDateColumn()
  createdAt: Date;
}
