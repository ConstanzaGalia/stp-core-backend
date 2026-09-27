import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StaffMembershipStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** Vínculo staff ↔ centro. INACTIVE conserva el registro y corta el acceso. */
@Entity('company_staff_membership')
@Index('UQ_company_staff_membership', ['companyId', 'userId'], { unique: true })
export class CompanyStaffMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: StaffMembershipStatus,
    default: StaffMembershipStatus.ACTIVE,
  })
  status: StaffMembershipStatus;

  @Column({ type: 'timestamp', default: () => 'now()' })
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  statusChangedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  statusChangedByUserId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Rol al momento del último cambio de estado. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  roleSnapshot: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
