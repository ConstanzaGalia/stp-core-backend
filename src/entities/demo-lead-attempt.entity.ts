import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Intento de alta de lead, para limitar pedidos por IP entre todas las
 * instancias del backend. Guarda un hash de la IP, nunca la IP en claro.
 * Se purga a diario.
 */
@Entity('demo_lead_attempt')
@Index('idx_demo_lead_attempt_ip_created', ['ipHash', 'createdAt'])
export class DemoLeadAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'ip_hash' })
  ipHash: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
