import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScreeningTestVideos1752500000000 implements MigrationInterface {
  name = 'AddScreeningTestVideos1752500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS biomechanical_screening_test_video (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_result_id UUID NOT NULL REFERENCES biomechanical_screening_test_result(id) ON DELETE CASCADE,
        view VARCHAR(12) NOT NULL,
        side VARCHAR(10),
        storage_key VARCHAR(500) NOT NULL,
        video_url VARCHAR(1000),
        duration_ms INT,
        width INT,
        height INT,
        fps_sampled DOUBLE PRECISION,
        pose_model VARCHAR(60),
        pose_track JSONB NOT NULL DEFAULT '[]'::jsonb,
        key_frames JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_screening_video_test_result
      ON biomechanical_screening_test_video (test_result_id);
    `);

    await queryRunner.query(`
      ALTER TABLE biomechanical_screening_test_snapshot
        ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'camera';
    `);

    await queryRunner.query(`
      ALTER TABLE biomechanical_screening_test_snapshot
        ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES biomechanical_screening_test_video(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE biomechanical_screening_test_snapshot
        ADD COLUMN IF NOT EXISTS video_time_ms INT;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_screening_snapshot_video
      ON biomechanical_screening_test_snapshot (video_id)
      WHERE video_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_screening_snapshot_video;`);
    await queryRunner.query(`
      ALTER TABLE biomechanical_screening_test_snapshot
        DROP COLUMN IF EXISTS video_time_ms,
        DROP COLUMN IF EXISTS video_id,
        DROP COLUMN IF EXISTS source;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS biomechanical_screening_test_video;`);
  }
}
