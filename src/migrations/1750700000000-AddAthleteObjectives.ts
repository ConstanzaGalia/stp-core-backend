import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAthleteObjectives1750700000000 implements MigrationInterface {
  name = 'AddAthleteObjectives1750700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'athlete_objective_type_enum') THEN
          CREATE TYPE athlete_objective_type_enum AS ENUM ('single_date', 'date_range', 'annual');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS athlete_objective (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type athlete_objective_type_enum NOT NULL,
        target_date DATE,
        start_date DATE,
        end_date DATE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_athlete_objective_user
        ON athlete_objective ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS athlete_objective;`);
    await queryRunner.query(`DROP TYPE IF EXISTS athlete_objective_type_enum;`);
  }
}
