import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { SafetyTag } from './safety-tag.entity';

export enum InjuryStatus {
  ACTIVA = 'activa',
  RECUPERACION = 'recuperacion',
  RESUELTA = 'resuelta',
}

/** Lesión aguda, afección/condición crónica u otro antecedente clínico relevante. */
export enum InjuryKind {
  LESION = 'lesion',
  AFECCION = 'afeccion',
  OTRO = 'otro',
}

@Entity('injury')
export class Injury {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.injuries, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  tipo: string;

  @Column({ type: 'enum', enum: InjuryKind, default: InjuryKind.LESION })
  kind: InjuryKind;

  @Column({ type: 'enum', enum: InjuryStatus, default: InjuryStatus.ACTIVA })
  estado: InjuryStatus;

  @Column({ type: 'date', name: 'fecha_inicio' })
  fechaInicio: Date;

  @Column({ type: 'date', nullable: true, name: 'fecha_resolucion' })
  fechaResolucion: Date;

  @ManyToMany(() => SafetyTag)
  @JoinTable({ name: 'injury_restriction_tags' })
  restrictionTags: SafetyTag[];

  @Column({ type: 'text', nullable: true })
  notas: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
