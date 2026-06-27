import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthTokenExpiry1750100000000 implements MigrationInterface {
  name = 'AddAuthTokenExpiry1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "active_token_expires_at" TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "reset_password_token_expires_at" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS "reset_password_token_expires_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS "active_token_expires_at"
    `);
  }
}
