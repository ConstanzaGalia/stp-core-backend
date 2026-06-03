import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAthleteInvitationIsOnline1750000000000 implements MigrationInterface {
  name = 'AddAthleteInvitationIsOnline1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "athlete_invitations"
      ADD COLUMN IF NOT EXISTS "is_online" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "athlete_invitations" DROP COLUMN IF EXISTS "is_online"
    `);
  }
}
