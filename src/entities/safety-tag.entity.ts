import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum BodyZone {
  COLUMNA = 'columna',
  TREN_INFERIOR = 'tren_inferior',
  TREN_SUPERIOR = 'tren_superior',
  HOMBRO = 'hombro',
  SISTEMICO = 'sistemico',
}

@Entity('safety_tag')
export class SafetyTag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: BodyZone })
  bodyZone: BodyZone;
}
