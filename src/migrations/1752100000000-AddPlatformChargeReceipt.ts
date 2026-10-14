import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformChargeReceipt1752100000000 implements MigrationInterface {
  name = 'AddPlatformChargeReceipt1752100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_platform_charges
      ADD COLUMN IF NOT EXISTS receipt_storage_key VARCHAR(500) NULL,
      ADD COLUMN IF NOT EXISTS receipt_filename VARCHAR(200) NULL,
      ADD COLUMN IF NOT EXISTS receipt_mime_type VARCHAR(100) NULL,
      ADD COLUMN IF NOT EXISTS receipt_uploaded_at TIMESTAMPTZ NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_platform_charges
      DROP COLUMN IF EXISTS receipt_uploaded_at,
      DROP COLUMN IF EXISTS receipt_mime_type,
      DROP COLUMN IF EXISTS receipt_filename,
      DROP COLUMN IF EXISTS receipt_storage_key;
    `);
  }
}
