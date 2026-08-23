import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BiomechanicalScreeningSession } from './biomechanical-screening-session.entity';
import type { ScreeningProtocolDefinition } from '../modules/biomechanical-screening/protocol/stp-functional-screening.v1';

@Entity('biomechanical_screening_protocol')
@Index(['code', 'version'], { unique: true })
export class BiomechanicalScreeningProtocol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  definition: ScreeningProtocolDefinition;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @OneToMany(() => BiomechanicalScreeningSession, (session) => session.protocol)
  sessions: BiomechanicalScreeningSession[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
