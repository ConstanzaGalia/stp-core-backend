import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Company } from './company.entity';
import { Reservation } from './reservation.entity';

@Entity()
export class TimeSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date;

  @Column()
  startTime: string;

  @Column()
  endTime: string;

  @Column()
  capacity: number;

  @Column({ type: 'int', default: 0 })
  reservedCount: number;

  @ManyToOne(() => Company, company => company.timeSlots)
  company: Company;

  @OneToMany(() => Reservation, reservation => reservation.timeSlot)
  reservations: Reservation[];

  isAvailable() {
    return this.reservedCount < this.capacity;
  }
}
