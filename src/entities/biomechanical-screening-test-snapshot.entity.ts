import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BiomechanicalScreeningTestResult } from './biomechanical-screening-test-result.entity';
import type {
  ScreeningCameraView,
  ScreeningSide,
} from '../modules/biomechanical-screening/protocol/stp-functional-screening.v1';
import type {
  PoseLandmarkPoint,
  ScreeningSnapshotAngles,
} from '../modules/biomechanical-screening/screening.types';

/**
 * Captura congelada de un test con los puntos de pose asociados.
 * La imagen se guarda limpia en Storage: el esqueleto se dibuja al renderizar
 * a partir de `landmarks`, para poder recalcular o corregir sin volver a filmar.
 */
@Entity('biomechanical_screening_test_snapshot')
@Index('idx_screening_snapshot_test_result', ['testResult'])
export class BiomechanicalScreeningTestSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BiomechanicalScreeningTestResult, (test) => test.snapshots, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'test_result_id' })
  testResult: BiomechanicalScreeningTestResult;

  @Column({ type: 'varchar', length: 80, name: 'slot_code' })
  slotCode: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 12 })
  view: ScreeningCameraView;

  @Column({ type: 'varchar', length: 10, nullable: true })
  side: ScreeningSide | null;

  @Column({ type: 'text', array: true, name: 'criterion_codes', default: () => "'{}'" })
  criterionCodes: string[];

  @Column({ type: 'varchar', length: 500, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 1000, name: 'image_url', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'varchar', length: 60, name: 'pose_model', nullable: true })
  poseModel: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  landmarks: PoseLandmarkPoint[];

  @Column({ type: 'jsonb', name: 'world_landmarks', nullable: true, default: () => 'null' })
  worldLandmarks: PoseLandmarkPoint[] | null;

  @Column({ type: 'jsonb', nullable: true, default: () => 'null' })
  angles: ScreeningSnapshotAngles | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ type: 'timestamp', name: 'captured_at', nullable: true })
  capturedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
