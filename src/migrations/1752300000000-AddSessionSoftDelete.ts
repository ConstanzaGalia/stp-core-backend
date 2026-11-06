import { MigrationInterface, QueryRunner } from 'typeorm';

/** Soft delete de sesiones STP: permite restaurar y auditar quién eliminó. */
export class AddSessionSoftDelete1752300000000 implements MigrationInterface {
  name = 'AddSessionSoftDelete1752300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
        ADD COLUMN IF NOT EXISTS deleted_at timestamp NULL,
        ADD COLUMN IF NOT EXISTS deleted_by_user_id varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS deleted_by_name varchar(200) NULL,
        ADD COLUMN IF NOT EXISTS deleted_reason varchar(100) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_session_deleted_at
      ON stp_session_instances (deleted_at) WHERE deleted_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stp_session_deleted_at`);
    await queryRunner.query(`
      ALTER TABLE stp_session_instances
        DROP COLUMN IF EXISTS deleted_reason,
        DROP COLUMN IF EXISTS deleted_by_name,
        DROP COLUMN IF EXISTS deleted_by_user_id,
        DROP COLUMN IF EXISTS deleted_at
    `);
  }
}
