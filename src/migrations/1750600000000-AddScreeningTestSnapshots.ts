import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScreeningTestSnapshots1750600000000 implements MigrationInterface {
  name = 'AddScreeningTestSnapshots1750600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS biomechanical_screening_test_snapshot (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_result_id UUID NOT NULL REFERENCES biomechanical_screening_test_result(id) ON DELETE CASCADE,
        slot_code VARCHAR(80) NOT NULL,
        label VARCHAR(120),
        view VARCHAR(12) NOT NULL,
        side VARCHAR(10),
        criterion_codes TEXT[] NOT NULL DEFAULT '{}'::text[],
        storage_key VARCHAR(500) NOT NULL,
        image_url VARCHAR(1000),
        width INT,
        height INT,
        pose_model VARCHAR(60),
        landmarks JSONB NOT NULL DEFAULT '[]'::jsonb,
        world_landmarks JSONB,
        angles JSONB,
        notes TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        captured_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_screening_snapshot_test_result
      ON biomechanical_screening_test_snapshot (test_result_id, sort_order);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS biomechanical_screening_test_snapshot;`);
  }
}
