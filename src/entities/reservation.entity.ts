import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn, Column } from 'typeorm';
import { User } from './user.entity';
import { TimeSlot } from './timeSlot.entity';

@Entity()
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.reservations)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', name: 'timeSlotId' })
  timeSlotId: string;

  @ManyToOne(() => TimeSlot, timeSlot => timeSlot.reservations, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'timeSlotId' })
  timeSlot: TimeSlot;

  @CreateDateColumn()
  createdAt: Date;
}
