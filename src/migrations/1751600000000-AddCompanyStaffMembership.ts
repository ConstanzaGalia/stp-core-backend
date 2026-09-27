import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyStaffMembership1751600000000 implements MigrationInterface {
  name = 'AddCompanyStaffMembership1751600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_staff_membership_status_enum') THEN
          CREATE TYPE "company_staff_membership_status_enum" AS ENUM ('ACTIVE', 'INACTIVE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "company_staff_membership" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "status" "company_staff_membership_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "statusChangedAt" TIMESTAMP,
        "statusChangedByUserId" uuid,
        "notes" text,
        "roleSnapshot" character varying(40),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_staff_membership" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_staff_membership" UNIQUE ("companyId", "userId"),
        CONSTRAINT "FK_company_staff_membership_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_company_staff_membership_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        join_table text;
        company_col text;
        user_col text;
      BEGIN
        SELECT c.relname INTO join_table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relkind = 'r'
          AND c.relname NOT IN (
            'company_staff_membership',
            'staff_compensation_profile',
            'staff_shift_assignment',
            'staff_compensation_period_rate',
            'staff_association_requests',
            'athlete_invitation',
            'athlete_invitations'
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public'
              AND col.table_name = c.relname
              AND col.column_name IN ('companyId', 'company_id')
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public'
              AND col.table_name = c.relname
              AND col.column_name IN ('userId', 'user_id')
          )
          AND (
            c.relname ILIKE '%company%user%'
            OR c.relname ILIKE '%user%company%'
          )
        ORDER BY CASE WHEN c.relname = 'company_users_user' THEN 0 ELSE 1 END
        LIMIT 1;

        IF join_table IS NULL THEN
          RETURN;
        END IF;

        SELECT column_name INTO company_col
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = join_table
          AND column_name IN ('companyId', 'company_id')
        LIMIT 1;

        SELECT column_name INTO user_col
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = join_table
          AND column_name IN ('userId', 'user_id')
        LIMIT 1;

        EXECUTE format(
          'INSERT INTO company_staff_membership ("companyId", "userId", "status", "joinedAt", "roleSnapshot")
           SELECT cu.%I, cu.%I, ''ACTIVE'', now(), u.role::text
           FROM %I cu
           JOIN "user" u ON u.id = cu.%I
           WHERE u.role::text IN (''TRAINER'', ''SUB_TRAINER'', ''DIRECTOR'', ''SECRETARIA'', ''STP_ADMIN'')
           ON CONFLICT ("companyId", "userId") DO NOTHING',
          company_col, user_col, join_table, user_col
        );
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_staff_membership"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "company_staff_membership_status_enum"`);
  }
}
