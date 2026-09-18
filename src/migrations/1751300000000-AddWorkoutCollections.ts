import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkoutCollections1751300000000 implements MigrationInterface {
  name = 'AddWorkoutCollections1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_workout_collections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by_user_id UUID,
        created_by_name TEXT,
        last_edited_by_user_id UUID,
        last_edited_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_collection_company
      ON stp_workout_collections(company_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_collection_company_active
      ON stp_workout_collections(company_id, is_active);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_collection_company_sort
      ON stp_workout_collections(company_id, sort_order);
    `);

    await queryRunner.query(`
      ALTER TABLE stp_workout_templates
      ADD COLUMN IF NOT EXISTS collection_id UUID NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_stp_workout_template_collection'
        ) THEN
          ALTER TABLE stp_workout_templates
          ADD CONSTRAINT fk_stp_workout_template_collection
          FOREIGN KEY (collection_id)
          REFERENCES stp_workout_collections(id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_workout_template_collection
      ON stp_workout_templates(collection_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_template_collection;`,
    );
    await queryRunner.query(`
      ALTER TABLE stp_workout_templates
      DROP CONSTRAINT IF EXISTS fk_stp_workout_template_collection;
    `);
    await queryRunner.query(`
      ALTER TABLE stp_workout_templates
      DROP COLUMN IF EXISTS collection_id;
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_collection_company_sort;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_collection_company_active;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_workout_collection_company;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS stp_workout_collections;`);
  }
}
