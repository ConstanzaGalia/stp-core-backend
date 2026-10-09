import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAthleteEmergencyContactAndObraSocial1751900000000 implements MigrationInterface {
  name = 'AddAthleteEmergencyContactAndObraSocial1751900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(200) NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS obra_social VARCHAR(200) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS obra_social;
    `);
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS emergency_contact;
    `);
  }
}
