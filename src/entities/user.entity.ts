import { Column, CreateDateColumn, DeleteDateColumn, Entity, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../common/enums/enums';
import { Company } from './company.entity';
import { Payment } from './payment.entity';
import { UserPaymentSubscription } from './user-payment-subscription.entity';
import { ClassUsage } from './class-usage.entity';
import { Slot } from './slot.entity';
import { TrainingPlan } from './traininPlan.entity';
import { UserPlan } from './userPlan.entity';
import { Reservation } from './reservation.entity';
import { AthleteInvitation } from './athlete-invitation.entity';
import { AthleteSchedule } from './athlete-schedule.entity';
import { AvailableClass } from './available-class.entity';

@Entity('user')
export class User {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({length: 50})
  name: string;

  @ApiProperty()
  @Column({length: 80, name: 'lastname'})
  lastName: string;

  @ApiProperty()
  @Column({ length: 100, unique: true })
  email: string;

  @ApiProperty()
  @Column()
  password: string;

  @ApiProperty()
  @Column({type: 'enum', enum: UserRole, default: UserRole.TRAINER})
  role: UserRole;

  @ApiProperty()
  @Column({name: 'phone_number', nullable: true, type: 'bigint'})
  phoneNumber?: number;

  @ApiProperty()
  @Column({nullable: true})
  country?: string;

  @ApiProperty()
  @Column({nullable: true})
  city?: string;

  @ApiProperty()
  @Column({name: 'image_profile', nullable: true})
  imageProfile?: string;

  @ApiProperty()
  @Column({name: 'date_of_birth', nullable: true, type: 'date'})
  dateOfBirth?: Date;

  @ApiProperty()
  @Column({name: 'specialty', nullable: true, length: 200})
  specialty?: string;

  @ApiProperty()
  @Column({name: 'biography', nullable: true, type: 'text'})
  biography?: string;

  @ApiProperty()
  @Column({name: 'experience_years', nullable: true})
  experienceYears?: number;

  @ApiProperty()
  @Column({type: 'boolean', default: false, name: 'is_active'})
  isActive?: boolean;

  @ApiProperty()
  @Column({unique: true, name: 'active_token', nullable: true})
  activeToken?: string;

  @ApiProperty()
  @Column({default: null, name: 'reset_password_token'})
  resetPasswordToken?: string;

  @ApiProperty()
  @Column({type: 'boolean', default: false, name: 'is_delete'})
  isDelete?: boolean;

  @ManyToMany(() => Company, company => company.users)
  company: Company[];

  @OneToMany(() => Payment, payment => payment.user)
  payments: Payment[];

  @OneToMany(() => UserPaymentSubscription, subscription => subscription.user)
  paymentSubscriptions: UserPaymentSubscription[];

  @OneToMany(() => ClassUsage, classUsage => classUsage.user)
  classUsages: ClassUsage[];

  @OneToMany(() => Slot, slot => slot.user)
  slots: Slot[];

  @OneToMany(() => TrainingPlan, trainingPlan => trainingPlan.user)
  trainingPlans: TrainingPlan[];

  @OneToMany(() => UserPlan, userPlan => userPlan.user)
  userPlans: UserPlan[];

  @OneToMany(() => Reservation, reservation => reservation.user)
  reservations: Reservation[];

  @OneToMany(() => AthleteInvitation, invitation => invitation.user)
  athleteInvitations: AthleteInvitation[];

  @OneToMany(() => AthleteSchedule, athleteSchedule => athleteSchedule.user)
  athleteSchedules: AthleteSchedule[];

  @OneToMany(() => AvailableClass, availableClass => availableClass.user)
  availableClasses: AvailableClass[];

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
  public created_at: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
  public updated_at: Date;

  @DeleteDateColumn({name: 'deleted_at'})
  deletedAt?: Date;
}