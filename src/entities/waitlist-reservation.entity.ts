import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, Column, Index } from 'typeorm';
import { User } from './user.entity';
import { TimeSlot } from './timeSlot.entity';

export enum WaitlistStatus {
  PENDING = 'pending',
  NOTIFIED = 'notified',
  CANCELLED = 'cancelled'
}

@Entity()
@Index(['user', 'timeSlot'], { unique: true }) // Evitar duplicados
export class WaitlistReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', name: 'userId' })
  userId: string;

  @ManyToOne(() => TimeSlot, { eager: true })
  @JoinColumn({ name: 'timeSlotId' })
  timeSlot: TimeSlot;

  @Column({ type: 'uuid', name: 'timeSlotId' })
  timeSlotId: string;

  @Column({
    type: 'enum',
    enum: WaitlistStatus,
    default: WaitlistStatus.PENDING
  })
  status: WaitlistStatus;

  @Column({ type: 'timestamp', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

