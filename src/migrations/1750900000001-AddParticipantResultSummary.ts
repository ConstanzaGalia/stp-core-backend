import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParticipantResultSummary1750900000001 implements MigrationInterface {
  name = 'AddParticipantResultSummary1750900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE competition_participants
        ADD COLUMN IF NOT EXISTS result_summary TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE competition_participants
        DROP COLUMN IF EXISTS result_summary;
    `);
  }
}
