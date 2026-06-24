import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSportsClubAndAssociations1750200000000 implements MigrationInterface {
  name = 'AddSportsClubAndAssociations1750200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_account_type_enum') THEN
          CREATE TYPE company_account_type_enum AS ENUM ('training_center', 'sports_club');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE company
      ADD COLUMN IF NOT EXISTS account_type company_account_type_enum NOT NULL DEFAULT 'training_center';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS divisions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        company_id  UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS division_coaches (
        division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
        user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        PRIMARY KEY (division_id, user_id)
      );
    `);

    await queryRunner.query(`
      ALTER TABLE athlete_invitations
      ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS staff_association_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        message TEXT,
        "companyResponse" TEXT,
        "approvedAt" TIMESTAMP,
        "rejectedAt" TIMESTAMP,
        "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "companyId" UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_association_requests_company_status
        ON staff_association_requests ("companyId", status);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_association_requests_user_company
        ON staff_association_requests ("userId", "companyId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS staff_association_requests`);
    await queryRunner.query(`
      ALTER TABLE athlete_invitations DROP COLUMN IF EXISTS division_id;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS division_coaches`);
    await queryRunner.query(`DROP TABLE IF EXISTS divisions`);
    await queryRunner.query(`
      ALTER TABLE company DROP COLUMN IF EXISTS account_type;
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS company_account_type_enum`);
  }
}
