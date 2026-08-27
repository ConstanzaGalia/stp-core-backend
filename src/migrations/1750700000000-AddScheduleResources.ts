import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleResources1750700000000 implements MigrationInterface {
  name = 'AddScheduleResources1750700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_resource_type_enum') THEN
          CREATE TYPE schedule_resource_type_enum AS ENUM ('space', 'group');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schedule_resource (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        type schedule_resource_type_enum NOT NULL DEFAULT 'space',
        default_capacity INT NOT NULL DEFAULT 10,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        division_id UUID REFERENCES divisions(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE schedule_config
      ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES schedule_resource(id) ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE time_slot
      ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES schedule_resource(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE athlete_schedules
      ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES schedule_resource(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_config_company_day_no_resource
      ON schedule_config ("companyId", "dayOfWeek")
      WHERE resource_id IS NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_config_company_day_resource
      ON schedule_config ("companyId", "dayOfWeek", resource_id)
      WHERE resource_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slot_company_date_start_no_resource
      ON time_slot ("companyId", date, "startTime", "isIntermediateSlot")
      WHERE resource_id IS NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slot_company_date_start_resource
      ON time_slot ("companyId", date, "startTime", resource_id, "isIntermediateSlot")
      WHERE resource_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slot_company_date_start_resource;`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slot_company_date_start_no_resource;`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_config_company_day_resource;`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_config_company_day_no_resource;`);
    await queryRunner.query(`ALTER TABLE athlete_schedules DROP COLUMN IF EXISTS resource_id;`);
    await queryRunner.query(`ALTER TABLE time_slot DROP COLUMN IF EXISTS resource_id;`);
    await queryRunner.query(`ALTER TABLE schedule_config DROP COLUMN IF EXISTS resource_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS schedule_resource;`);
    await queryRunner.query(`DROP TYPE IF EXISTS schedule_resource_type_enum;`);
  }
}
