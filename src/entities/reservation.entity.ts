import { Entity, PrimaryGeneratedColumn, ManyToOne, OneToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, Column } from 'typeorm';
import { User } from './user.entity';
import { TimeSlot } from './timeSlot.entity';
import { AvailableClass } from './available-class.entity';

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

  @Column({ type: 'boolean', nullable: true, name: 'attendance_status' })
  attendanceStatus: boolean | null;

  @OneToOne(() => AvailableClass, availableClass => availableClass.reservation, { nullable: true })
  availableClass: AvailableClass;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
