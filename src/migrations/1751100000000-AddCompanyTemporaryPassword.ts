import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyTemporaryPassword1751100000000 implements MigrationInterface {
  name = 'AddCompanyTemporaryPassword1751100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE company
      ADD COLUMN IF NOT EXISTS temporary_password VARCHAR(100) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE company DROP COLUMN IF EXISTS temporary_password;
    `);
  }
}
