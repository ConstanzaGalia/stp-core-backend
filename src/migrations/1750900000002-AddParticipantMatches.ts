import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParticipantMatches1750900000002 implements MigrationInterface {
  name = 'AddParticipantMatches1750900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE competition_status_enum ADD VALUE 'IN_PROGRESS';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competition_participant_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        participant_id UUID NOT NULL REFERENCES competition_participants(id) ON DELETE CASCADE,
        played_at DATE,
        round_label VARCHAR(100),
        opponent VARCHAR(200),
        result_summary TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_competition_participant_matches_participant
        ON competition_participant_matches (participant_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS competition_participant_matches;`);
  }
}
