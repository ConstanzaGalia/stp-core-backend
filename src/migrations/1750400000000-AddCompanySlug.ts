import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanySlug1750400000000 implements MigrationInterface {
  name = 'AddCompanySlug1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE company
      ADD COLUMN IF NOT EXISTS slug VARCHAR(50) UNIQUE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE company DROP COLUMN IF EXISTS slug;
    `);
  }
}
