import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DemoLeadEvent } from './demo-lead-event.entity';
import {
  DemoLeadPlan,
  DemoLeadStatus,
} from '../modules/demo-leads/demo-leads.constants';

/**
 * Lead capturado en la demo pública (/demo). No es un usuario ni un centro:
 * solo datos de contacto, consentimiento y origen comercial.
 */
@Entity('demo_lead')
@Index('idx_demo_lead_status_created', ['status', 'createdAt'])
export class DemoLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Siempre en minúsculas y sin espacios (único). */
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, name: 'phone_e164' })
  phoneE164: string;

  @Column({ type: 'varchar', length: 40, name: 'phone_raw' })
  phoneRaw: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 160, name: 'gym_name', nullable: true })
  gymName: string | null;

  /** Plan con el que llegó desde la landing (`?plan=`). */
  @Column({ type: 'varchar', length: 20, name: 'plan_interest', nullable: true })
  planInterest: DemoLeadPlan | null;

  /** Plan elegido al tocar "Quiero empezar". */
  @Column({ type: 'varchar', length: 20, name: 'selected_plan', nullable: true })
  selectedPlan: DemoLeadPlan | null;

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

  /** Página donde se completó el formulario (con su query string). */
  @Column({ type: 'varchar', length: 500, name: 'landing_url', nullable: true })
  landingUrl: string | null;

  @Column({ type: 'varchar', length: 40, default: 'demo' })
  source: string;

  @Column({ type: 'boolean', name: 'consent_contact' })
  consentContact: boolean;

  @Column({ type: 'timestamptz', name: 'consent_at' })
  consentAt: Date;

  @Column({ type: 'varchar', length: 20, name: 'consent_text_version' })
  consentTextVersion: string;

  @Column({ type: 'varchar', length: 20, default: DemoLeadStatus.NEW })
  status: DemoLeadStatus;

  @Column({ type: 'timestamptz', name: 'status_changed_at', nullable: true })
  statusChangedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'demo_completed_at', nullable: true })
  demoCompletedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'wants_to_start_at', nullable: true })
  wantsToStartAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => DemoLeadEvent, (event) => event.lead)
  events?: DemoLeadEvent[];
}
