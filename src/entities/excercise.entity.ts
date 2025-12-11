import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable } from 'typeorm';
import { Category } from './category.entity';
import { Tag } from './tag.entity';


@Entity()
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  video: string;

  @ManyToOne(() => Category, category => category.exercises)
  primaryCategory: Category;


  @ManyToMany(() => Tag, tag => tag.exercises)
  @JoinTable()
  tags: Tag[];
}
