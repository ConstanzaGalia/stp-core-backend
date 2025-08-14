import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Payment } from './payment.entity';
import { Slot } from './slot.entity';
import { TrainingPlan } from './traininPlan.entity';
import { TimeSlot } from './timeSlot.entity';
import { ScheduleConfig } from './schedule-config.entity';
import { ScheduleException } from './schedule-exception.entity';
import { TimeSlotGeneration } from './time-slot-generation.entity';

@Entity('company')
export class Company {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({length: 50, unique: true})
  name: string;

  @ApiProperty()
  @Column({length: 400})
  image?: string;

  @ApiProperty()
  @Column({ length: 50})
  primary_color?: string;

  @ApiProperty()
  @Column({ length: 50})
  secondary_color?: string;

  @ApiProperty()
  @Column({type: 'boolean', default: false, name: 'is_delete'})
  isDelete?: boolean;

  @ManyToMany(() => User, user => user.company)
  @JoinTable()
  users: User[];

  @OneToMany(() => Payment, payment => payment.company)
  payments: Payment[];

  @OneToMany(() => Slot, slot => slot.company)
  slots: Slot[];

  @OneToMany(() => TrainingPlan, trainingPlan => trainingPlan.company)
  trainingPlans: TrainingPlan[];

  @OneToMany(() => TimeSlot, timeSlot => timeSlot.company)
  timeSlots: TimeSlot[];

  @OneToMany(() => ScheduleConfig, scheduleConfig => scheduleConfig.company)
  scheduleConfigs: ScheduleConfig[];

  @OneToMany(() => ScheduleException, scheduleException => scheduleException.company)
  scheduleExceptions: ScheduleException[];

  @OneToMany(() => TimeSlotGeneration, timeSlotGeneration => timeSlotGeneration.company)
  timeSlotGenerations: TimeSlotGeneration[];

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
  public created_at: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
  public updated_at: Date;

  @DeleteDateColumn({name: 'deleted_at'})
  deletedAt?: Date;
}