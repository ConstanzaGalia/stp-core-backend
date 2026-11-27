import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AthleteProgramLeadStatus,
  AthleteProgramModality,
} from '../modules/athlete-program-leads/athlete-program-leads.constants';

/**
 * Persona que dejó sus datos en /soy-atleta para entrenar online o en el
 * gimnasio. No es un usuario ni un atleta del centro.
 */
@Entity('athlete_program_lead')
@Index('idx_athlete_program_lead_status_created', ['status', 'createdAt'])
@Index('idx_athlete_program_lead_modality_created', ['modality', 'createdAt'])
export class AthleteProgramLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, name: 'phone_e164' })
  phoneE164: string;

  @Column({ type: 'varchar', length: 40, name: 'phone_raw' })
  phoneRaw: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  modality: AthleteProgramModality;

  /** Nombre del programa de la landing, si eligió una tarjeta. */
  @Column({ type: 'varchar', length: 160, name: 'program_interest', nullable: true })
  programInterest: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 200, name: 'utm_source', nullable: true })
  utmSource: string | null;

  @Column({ type: 'varchar', length: 200, name: 'utm_medium', nullable: true })
  utmMedium: string | null;

  @Column({ type: 'varchar', length: 200, name: 'utm_campaign', nullable: true })
  utmCampaign: string | null;

  @Column({ type: 'varchar', length: 200, name: 'utm_content', nullable: true })
  utmContent: string | null;

  @Column({ type: 'varchar', length: 200, name: 'utm_term', nullable: true })
  utmTerm: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  referrer: string | null;

  @Column({ type: 'varchar', length: 500, name: 'landing_url', nullable: true })
  landingUrl: string | null;

  @Column({ type: 'varchar', length: 40, default: 'soy-atleta' })
  source: string;

  @Column({ type: 'boolean', name: 'consent_contact' })
  consentContact: boolean;

  @Column({ type: 'timestamptz', name: 'consent_at' })
  consentAt: Date;

  @Column({ type: 'varchar', length: 20, name: 'consent_text_version' })
  consentTextVersion: string;

  @Column({ type: 'varchar', length: 20, default: AthleteProgramLeadStatus.NEW })
  status: AthleteProgramLeadStatus;

  @Column({ type: 'timestamptz', name: 'status_changed_at', nullable: true })
  statusChangedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
