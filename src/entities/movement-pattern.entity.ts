import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Exercise } from './excercise.entity';

@Entity('movement_pattern')
export class MovementPattern {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => Exercise, (exercise) => exercise.movementPattern)
  exercises: Exercise[];
}
