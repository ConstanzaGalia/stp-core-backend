import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';

@Entity()
export class TrainingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @ManyToOne(() => User, user => user.trainingPlans)
  user: User;

  @ManyToOne(() => Company, company => company.trainingPlans)
  company: Company;
}
