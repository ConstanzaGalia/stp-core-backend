import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';

@Entity()
export class Slot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date;

  @Column()
  time: string;

  @ManyToOne(() => User, user => user.slots)
  user: User;

  @ManyToOne(() => Company, company => company.slots)
  company: Company;
}
