import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInjuryPermanente1750800000000 implements MigrationInterface {
  name = 'AddInjuryPermanente1750800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE injury
        ADD COLUMN IF NOT EXISTS permanente BOOLEAN NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE injury DROP COLUMN IF EXISTS permanente;
    `);
  }
}
