import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DemoLead } from './demo-lead.entity';
import { DemoLeadEventType } from '../modules/demo-leads/demo-leads.constants';

/** Evento del embudo de la demo (lead capturado, paso visto, demo completada, "Quiero empezar"). */
@Entity('demo_lead_event')
@Index('idx_demo_lead_event_lead_created', ['lead', 'createdAt'])
export class DemoLeadEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DemoLead, (lead) => lead.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: DemoLead;

  @Column({ type: 'varchar', length: 30, name: 'event_type' })
  eventType: DemoLeadEventType;

  @Column({ type: 'varchar', length: 40, nullable: true })
  step: string | null;

  /** Mismo id que usa el píxel de Meta en el navegador; único para no contar doble. */
  @Column({ type: 'varchar', length: 64, name: 'event_id', unique: true })
  eventId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
