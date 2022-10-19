import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../common/enums/enums';

@Entity('user')
export class User {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column()
  lastName: string;

  @ApiProperty()
  @Column({ unique: true })
  email?: string;

  @ApiProperty()
  @Column()
  password?: string;

  @ApiProperty()
  @Column({type: 'enum', enum: UserRole, default: UserRole.TRAINER})
  role?: string;

  @ApiProperty()
  @Column()
  phoneNumber?: number;

  @ApiProperty()
  @Column()
  country?: string;

  @ApiProperty()
  @Column()
  city?: string;

  @ApiProperty()
  @Column()
  imageProfile?: string;

  @ApiProperty()
  @Column({type: 'boolean', default: false})
  isActive?: boolean;

  @ApiProperty()
  @Column({unique: true})
  activeToken?: string;

  @ApiProperty()
  @Column({default: null})
  resetPasswordToken?: string;

  @ApiProperty()
  @Column({type: 'boolean', default: false})
  isDelete?: boolean;

  @Column({ nullable: true })
  createdAt?: string;

  @UpdateDateColumn()
  updatedAt?: string;

  @DeleteDateColumn()
  deletedAt?: string;
}