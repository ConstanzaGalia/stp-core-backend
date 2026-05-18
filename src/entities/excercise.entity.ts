import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable } from 'typeorm';
import { Category } from './category.entity';
import { Tag } from './tag.entity';
import { MovementPattern } from './movement-pattern.entity';
import { SafetyTag } from './safety-tag.entity';

@Entity()
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  video: string;

  @ManyToOne(() => Category, (category) => category.exercises, { nullable: true })
  primaryCategory: Category;

  @ManyToMany(() => Tag, (tag) => tag.exercises)
  @JoinTable()
  tags: Tag[];

  @ManyToOne(() => MovementPattern, (mp) => mp.exercises, { nullable: true })
  movementPattern: MovementPattern;

  @Column({ type: 'simple-array', nullable: true })
  material: string[];

  @Column({ default: false })
  unilateral: boolean;

  @Column({ default: false, name: 'es_isometrico' })
  esIsometrico: boolean;

  @Column({ default: false, name: 'es_ancla' })
  isAncla: boolean;

  // --- 6 dimensiones binarias del score ---
  @Column({ default: false })
  carga: boolean;

  @Column({ default: false })
  impacto: boolean;

  @Column({ default: false })
  rotacion: boolean;

  @Column({ default: false })
  multiarticular: boolean;

  @Column({ default: false })
  inestabilidad: boolean;

  // score = carga + unilateral + impacto + rotacion + multiarticular + inestabilidad (0-6)
  @Column({ type: 'float', default: 0, name: 'score_total' })
  scoreTotal: number;

  @ManyToMany(() => SafetyTag)
  @JoinTable({ name: 'exercise_safety_tags' })
  safetyTags: SafetyTag[];

  @Column({ type: 'simple-array', nullable: true, name: 'fase_recomendada' })
  faseRecomendada: string[];
}
