import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkoutTemplatesAndSessionVisibility1751200000000
  implements MigrationInterface
{
  name = 'AddWorkoutTemplatesAndSessionVisibility1751200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_workout_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        phase VARCHAR(50),
        pattern VARCHAR(30),
        tags TEXT[] NOT NULL DEFAULT '{}',
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        blocks JSONB NOT NULL DEFAULT '[]',
        endurance_format VARCHAR(20),
        endurance_config JSONB,
        created_by_user_id UUID,
        created_by_name TEXT,
        last_edited_by_user_id UUID,
        last_edited_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_template_company
      ON stp_workout_templates(company_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_template_company_active
      ON stp_workout_templates(company_id, is_active);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_template_company_sort
      ON stp_workout_templates(company_id, sort_order);
    `);

    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS coach_status VARCHAR(20) NOT NULL DEFAULT 'published';
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS source_workout_template_id UUID NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS safety_conflicts JSONB NOT NULL DEFAULT '[]';
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS attendance_marked_by_user_id UUID NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS attendance_marked_by_name TEXT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      ADD COLUMN IF NOT EXISTS attendance_source VARCHAR(40) NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_session_coach_status
      ON stp_session_instances(athlete_id, coach_status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_session_coach_status;`,
    );
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
      DROP COLUMN IF EXISTS attendance_source,
      DROP COLUMN IF EXISTS attendance_marked_at,
      DROP COLUMN IF EXISTS attendance_marked_by_name,
      DROP COLUMN IF EXISTS attendance_marked_by_user_id,
      DROP COLUMN IF EXISTS safety_conflicts,
      DROP COLUMN IF EXISTS source_workout_template_id,
      DROP COLUMN IF EXISTS coach_status;
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_template_company_sort;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_template_company_active;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_template_company;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS stp_workout_templates;`);
  }
}
