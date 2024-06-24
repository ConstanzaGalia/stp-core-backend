import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  amount: number;

  @Column()
  date: Date;

  @ManyToOne(() => User, user => user.payments)
  user: User;

  @ManyToOne(() => Company, company => company.payments)
  company: Company;
}
