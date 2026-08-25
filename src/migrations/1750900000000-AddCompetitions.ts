import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompetitions1750900000000 implements MigrationInterface {
  name = 'AddCompetitions1750900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_date_type_enum') THEN
          CREATE TYPE competition_date_type_enum AS ENUM ('single_date', 'date_range');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_status_enum') THEN
          CREATE TYPE competition_status_enum AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        sport VARCHAR(100) NOT NULL,
        date_type competition_date_type_enum NOT NULL,
        target_date DATE,
        start_date DATE,
        end_date DATE,
        location VARCHAR(255),
        description TEXT,
        status competition_status_enum NOT NULL DEFAULT 'PLANNED',
        result_summary TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_competitions_company
        ON competitions (company_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competition_divisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE (competition_id, division_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS competition_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        division_id UUID REFERENCES divisions(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE (competition_id, user_id)
      );
    `);

    await queryRunner.query(`
      ALTER TABLE athlete_objective
        ADD COLUMN IF NOT EXISTS competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_athlete_objective_competition_user
        ON athlete_objective (competition_id, "userId")
        WHERE competition_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_athlete_objective_competition_user;`);
    await queryRunner.query(`
      ALTER TABLE athlete_objective DROP COLUMN IF EXISTS competition_id;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS competition_participants;`);
    await queryRunner.query(`DROP TABLE IF EXISTS competition_divisions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS competitions;`);
    await queryRunner.query(`DROP TYPE IF EXISTS competition_status_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS competition_date_type_enum;`);
  }
}
