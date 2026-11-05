import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupProgramsModelB1751310000000 implements MigrationInterface {
  name = 'GroupProgramsModelB1751310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_group_programs
        ADD COLUMN IF NOT EXISTS sessions_per_week INT NOT NULL DEFAULT 3;
    `);
    await queryRunner.query(`
      UPDATE stp_group_programs
      SET sessions_per_week = GREATEST(
        2,
        LEAST(5, COALESCE(cardinality(training_days), 3))
      )
      WHERE sessions_per_week < 2 OR sessions_per_week > 5;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_program_enrollments
        ADD COLUMN IF NOT EXISTS training_days INT[] NOT NULL DEFAULT '{}';
    `);
    await queryRunner.query(`
      UPDATE stp_group_program_enrollments e
      SET training_days = COALESCE(p.training_days, '{0,2,4}'::int[])
      FROM stp_group_programs p
      WHERE e.program_id = p.id
        AND (e.training_days IS NULL OR cardinality(e.training_days) = 0);
    `);
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY program_id, week_index
            ORDER BY day_of_week ASC NULLS LAST, session_ordinal ASC, id ASC
          ) AS rn
        FROM stp_group_program_slots
      )
      UPDATE stp_group_program_slots s
      SET session_ordinal = ranked.rn
      FROM ranked
      WHERE s.id = ranked.id;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_program_slots
        ALTER COLUMN day_of_week DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_program_slots
        DROP CONSTRAINT IF EXISTS stp_group_program_slots_program_id_week_index_day_of_week_key;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_program_slots
        DROP CONSTRAINT IF EXISTS uq_stp_group_program_slot_week_day;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_stp_group_program_slot_week_ordinal'
        ) THEN
          ALTER TABLE stp_group_program_slots
            ADD CONSTRAINT uq_stp_group_program_slot_week_ordinal
            UNIQUE (program_id, week_index, session_ordinal);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_group_program_slots
        DROP CONSTRAINT IF EXISTS uq_stp_group_program_slot_week_ordinal;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_program_enrollments
        DROP COLUMN IF EXISTS training_days;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_programs
        DROP COLUMN IF EXISTS sessions_per_week;
    `);
  }
}
