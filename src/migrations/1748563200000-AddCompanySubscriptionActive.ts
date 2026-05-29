import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanySubscriptionActive1748563200000 implements MigrationInterface {
  name = 'AddCompanySubscriptionActive1748563200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company"
      ADD COLUMN IF NOT EXISTS "subscription_active" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" DROP COLUMN IF EXISTS "subscription_active"
    `);
  }
}
