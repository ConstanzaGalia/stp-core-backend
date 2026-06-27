import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';
import { Division } from './division.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  LEFT = 'left'
}

@Entity('athlete_invitations')
export class AthleteInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING
  })
  status: InvitationStatus;

  @Column({ type: 'text', nullable: true })
  message: string; // Mensaje opcional del atleta al enviar solicitud

  @Column({ type: 'text', nullable: true })
  companyResponse: string; // Respuesta de la empresa (opcional)

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date; // Fecha de aprobación

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt: Date; // Fecha de rechazo

  @Column({ type: 'timestamp', nullable: true })
  leftAt: Date; // Fecha en que salió del centro

  @Column({ type: 'boolean', default: false, name: 'is_online' })
  isOnline: boolean; // Atleta online: no ve turnos ni horario fijo

  @ManyToOne(() => User, (user) => user.athleteInvitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Company, (company) => company.athleteInvitations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  /** División a la que pertenece la jugadora (solo para clubs deportivos). Nullable. */
  @ManyToOne(() => Division, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
