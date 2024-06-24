import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Plan } from './plan.entity';

@Entity()
export class UserPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.userPlans)
  user: User;

  @ManyToOne(() => Plan, plan => plan.userPlans)
  plan: Plan;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column()
  paymentStatus: boolean;
}
