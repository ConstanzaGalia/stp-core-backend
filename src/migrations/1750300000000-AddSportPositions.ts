import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSportPositions1750300000000 implements MigrationInterface {
  name = 'AddSportPositions1750300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sport_positions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        company_id  UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE athlete_invitations
      ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES sport_positions(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE athlete_invitations DROP COLUMN IF EXISTS position_id;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS sport_positions;`);
  }
}
