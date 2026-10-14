import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformRenewalNotice1752000000000 implements MigrationInterface {
  name = 'AddPlatformRenewalNotice1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_platform_subscriptions
      ADD COLUMN IF NOT EXISTS renewal_notice_sent_at TIMESTAMPTZ NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_platform_subscriptions
      DROP COLUMN IF EXISTS renewal_notice_sent_at;
    `);
  }
}
