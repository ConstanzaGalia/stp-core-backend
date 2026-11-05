import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupPrograms1751300000000 implements MigrationInterface {
  name = 'AddGroupPrograms1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_group_programs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        short_name VARCHAR(40),
        description TEXT,
        phase VARCHAR(50) NOT NULL DEFAULT 'adaptacion',
        start_date DATE NOT NULL,
        weeks_count INT NOT NULL DEFAULT 4,
        training_days INT[] NOT NULL DEFAULT '{0,2,4}',
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        created_by_user_id UUID,
        created_by_name TEXT,
        last_edited_by_user_id UUID,
        last_edited_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_group_program_slots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        program_id UUID NOT NULL REFERENCES stp_group_programs(id) ON DELETE CASCADE,
        week_index INT NOT NULL,
        day_of_week INT NOT NULL,
        session_ordinal INT NOT NULL DEFAULT 1,
        workout_template_id UUID NOT NULL REFERENCES stp_workout_templates(id),
        week_type VARCHAR(20) NOT NULL DEFAULT 'carga',
        prescription_overrides JSONB,
        notes TEXT,
        UNIQUE (program_id, week_index, day_of_week)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_group_program_enrollments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        program_id UUID NOT NULL REFERENCES stp_group_programs(id) ON DELETE CASCADE,
        athlete_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        start_week_index INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (program_id, athlete_id)
      );
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
        ADD COLUMN IF NOT EXISTS group_program_id UUID NULL REFERENCES stp_group_programs(id) ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
        ADD COLUMN IF NOT EXISTS group_program_slot_id UUID NULL REFERENCES stp_group_program_slots(id) ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
        ADD COLUMN IF NOT EXISTS is_customized BOOLEAN NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE stp_session_instances DROP COLUMN IF EXISTS is_customized;`,
    );
    await queryRunner.query(
      `ALTER TABLE stp_session_instances DROP COLUMN IF EXISTS group_program_slot_id;`,
    );
    await queryRunner.query(
      `ALTER TABLE stp_session_instances DROP COLUMN IF EXISTS group_program_id;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS stp_group_program_enrollments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS stp_group_program_slots;`);
    await queryRunner.query(`DROP TABLE IF EXISTS stp_group_programs;`);
  }
}
