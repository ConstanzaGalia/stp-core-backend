import { MigrationInterface, QueryRunner } from 'typeorm';

/** Rol comercial de STP. Postgres 12+ acepta ADD VALUE dentro de la transacción. */
export class AddStpSalesRole1752900000000 implements MigrationInterface {
  name = 'AddStpSalesRole1752900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'STP_SALES';
    `);
  }

  public async down(): Promise<void> {
    // Postgres no permite quitar un valor de un enum en uso.
  }
}
