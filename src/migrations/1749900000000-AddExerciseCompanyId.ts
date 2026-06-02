import { MigrationInterface, QueryRunner } from 'typeorm';
import { STP_MAIN_COMPANY_ID } from '../modules/exercise/exercise.constants';

export class AddExerciseCompanyId1749900000000 implements MigrationInterface {
  name = 'AddExerciseCompanyId1749900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exercise"
      ADD COLUMN IF NOT EXISTS "companyId" uuid
    `);

    await queryRunner.query(
      `UPDATE "exercise" SET "companyId" = $1 WHERE "companyId" IS NULL`,
      [STP_MAIN_COMPANY_ID],
    );

    await queryRunner.query(`
      ALTER TABLE "exercise"
      ALTER COLUMN "companyId" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_exercise_company'
        ) THEN
          ALTER TABLE "exercise"
          ADD CONSTRAINT "FK_exercise_company"
          FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_exercise_companyId" ON "exercise" ("companyId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_exercise_companyId"`);
    await queryRunner.query(`
      ALTER TABLE "exercise" DROP CONSTRAINT IF EXISTS "FK_exercise_company"
    `);
    await queryRunner.query(`
      ALTER TABLE "exercise" DROP COLUMN IF EXISTS "companyId"
    `);
  }
}
