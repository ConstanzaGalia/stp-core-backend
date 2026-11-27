import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fin de prueba gratuita por centro (`company.trial_ends_at`, NULL = sin prueba en curso). */
export class AddCompanyTrial1752700000000 implements MigrationInterface {
  name = 'AddCompanyTrial1752700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE company ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company DROP COLUMN IF EXISTS trial_ends_at;`);
  }
}
