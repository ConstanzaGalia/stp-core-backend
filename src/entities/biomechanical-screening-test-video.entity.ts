import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BiomechanicalScreeningTestResult } from './biomechanical-screening-test-result.entity';
import { BiomechanicalScreeningTestSnapshot } from './biomechanical-screening-test-snapshot.entity';
import type {
  ScreeningCameraView,
  ScreeningSide,
} from '../modules/biomechanical-screening/protocol/stp-functional-screening.v1';
import type {
  PoseTrackFrame,
  ScreeningKeyFrame,
} from '../modules/biomechanical-screening/screening.types';

/**
 * Video subido de un test con el track de pose muestreado en el navegador.
 * El archivo vive en Storage; `poseTrack` permite reabrir el player sin reanalizar.
 */
@Entity('biomechanical_screening_test_video')
@Index('idx_screening_video_test_result', ['testResult'])
export class BiomechanicalScreeningTestVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BiomechanicalScreeningTestResult, (test) => test.videos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'test_result_id' })
  testResult: BiomechanicalScreeningTestResult;

  @Column({ type: 'varchar', length: 12 })
  view: ScreeningCameraView;

  @Column({ type: 'varchar', length: 10, nullable: true })
  side: ScreeningSide | null;

  @Column({ type: 'varchar', length: 500, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 1000, name: 'video_url', nullable: true })
  videoUrl: string | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'float', name: 'fps_sampled', nullable: true })
  fpsSampled: number | null;

  @Column({ type: 'varchar', length: 60, name: 'pose_model', nullable: true })
  poseModel: string | null;

  @Column({ type: 'jsonb', name: 'pose_track', default: () => "'[]'" })
  poseTrack: PoseTrackFrame[];

  @Column({ type: 'jsonb', name: 'key_frames', default: () => "'[]'" })
  keyFrames: ScreeningKeyFrame[];

  @OneToMany(() => BiomechanicalScreeningTestSnapshot, (snapshot) => snapshot.video)
  snapshots: BiomechanicalScreeningTestSnapshot[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
