import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { TimeSlot } from './timeSlot.entity';

@Entity()
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.reservations)
  user: User;

  @ManyToOne(() => TimeSlot, timeSlot => timeSlot.reservations)
  timeSlot: TimeSlot;
}
