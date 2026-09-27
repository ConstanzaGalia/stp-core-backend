import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnforceWeeklyLimit1751700000000 implements MigrationInterface {
  name = 'AddEnforceWeeklyLimit1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_plans"
      ADD COLUMN IF NOT EXISTS "enforceWeeklyLimit" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_plans" DROP COLUMN IF EXISTS "enforceWeeklyLimit"
    `);
  }
}
