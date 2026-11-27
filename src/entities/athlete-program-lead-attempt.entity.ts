import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Intento de alta por IP, para el límite de la landing de atletas. */
@Entity('athlete_program_lead_attempt')
@Index('idx_athlete_program_lead_attempt_ip_created', ['ipHash', 'createdAt'])
export class AthleteProgramLeadAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'ip_hash' })
  ipHash: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
