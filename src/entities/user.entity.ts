import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../common/enums/enums';

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
  @Column({name: 'phone_number'})
  phoneNumber?: number;

  @ApiProperty()
  @Column()
  country?: string;

  @ApiProperty()
  @Column()
  city?: string;

  @ApiProperty()
  @Column({name: 'image_profile'})
  imageProfile?: string;

  @ApiProperty()
  @Column({type: 'boolean', default: false, name: 'is_active'})
  isActive?: boolean;

  @ApiProperty()
  @Column({unique: true, name: 'active_token'})
  activeToken?: string;

  @ApiProperty()
  @Column({default: null, name: 'reset_password_token'})
  resetPasswordToken?: string;

  @ApiProperty()
  @Column({type: 'boolean', default: false, name: 'is_delete'})
  isDelete?: boolean;

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
  public created_at: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
  public updated_at: Date;

  @DeleteDateColumn({name: 'deleted_at'})
  deletedAt?: Date;
}