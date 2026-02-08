import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Company } from './company.entity';

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

  // Relaciones
  @ManyToOne(() => User, user => user.athleteInvitations, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Company, company => company.athleteInvitations, { onDelete: 'CASCADE' })
  company: Company;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
