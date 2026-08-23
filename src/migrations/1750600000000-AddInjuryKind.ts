import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInjuryKind1750600000000 implements MigrationInterface {
  name = 'AddInjuryKind1750600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'injury_kind_enum') THEN
          CREATE TYPE injury_kind_enum AS ENUM ('lesion', 'afeccion', 'otro');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE injury
        ADD COLUMN IF NOT EXISTS kind injury_kind_enum NOT NULL DEFAULT 'lesion';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE injury DROP COLUMN IF EXISTS kind;`);
    await queryRunner.query(`DROP TYPE IF EXISTS injury_kind_enum;`);
  }
}
