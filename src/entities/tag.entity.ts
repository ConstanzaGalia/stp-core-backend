import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Exercise } from './excercise.entity';


@Entity()
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToMany(() => Exercise, exercise => exercise.tags)
  exercises: Exercise[];
}
