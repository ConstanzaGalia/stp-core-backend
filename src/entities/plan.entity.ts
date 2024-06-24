import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserPlan } from './userPlan.entity';


@Entity()
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  slotsPerWeek: number;

  @OneToMany(() => UserPlan, userPlan => userPlan.plan)
  userPlans: UserPlan[];
}
