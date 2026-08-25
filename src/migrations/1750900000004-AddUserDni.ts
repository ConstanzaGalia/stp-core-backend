import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDni1750900000004 implements MigrationInterface {
  name = 'AddUserDni1750900000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS dni VARCHAR(20) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS dni;
    `);
  }
}
