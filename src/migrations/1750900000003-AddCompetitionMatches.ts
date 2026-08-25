import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompetitionMatches1750900000003 implements MigrationInterface {
  name = 'AddCompetitionMatches1750900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competition_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        played_at DATE,
        round_label VARCHAR(100),
        opponent VARCHAR(200),
        result_summary TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_competition_matches_competition
        ON competition_matches (competition_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS competition_matches;`);
  }
}
