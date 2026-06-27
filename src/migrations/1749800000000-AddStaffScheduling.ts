import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffScheduling1749800000000 implements MigrationInterface {
  name = 'AddStaffScheduling1749800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_compensation_profile_pay_type_enum') THEN
          CREATE TYPE "staff_compensation_profile_pay_type_enum" AS ENUM (
            'hourly', 'fixed_monthly', 'weekly_hours_x4'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_compensation_profile" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "pay_type" "staff_compensation_profile_pay_type_enum" NOT NULL DEFAULT 'hourly',
        "hourly_rate" numeric(12,2),
        "fixed_monthly_amount" numeric(12,2),
        "display_color" character varying(20),
        "sort_order" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_compensation_profile" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_staff_compensation_profile" UNIQUE ("companyId", "userId"),
        CONSTRAINT "FK_staff_compensation_profile_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_compensation_profile_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_shift_assignment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "date" date NOT NULL,
        "startTime" character varying(5) NOT NULL,
        "endTime" character varying(5) NOT NULL,
        "duration_minutes" integer NOT NULL DEFAULT 60,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_shift_assignment" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_staff_shift_assignment" UNIQUE ("companyId", "date", "startTime", "userId"),
        CONSTRAINT "FK_staff_shift_assignment_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_shift_assignment_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_shift_assignment_company_date"
      ON "staff_shift_assignment" ("companyId", "date")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_shift_closure" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyId" uuid NOT NULL,
        "date" date NOT NULL,
        "startTime" character varying(5) NOT NULL,
        "endTime" character varying(5) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_shift_closure" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_staff_shift_closure" UNIQUE ("companyId", "date", "startTime"),
        CONSTRAINT "FK_staff_shift_closure_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_shift_closure_company_date"
      ON "staff_shift_closure" ("companyId", "date")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_week_note" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyId" uuid NOT NULL,
        "week_start_date" date NOT NULL,
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_week_note" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_staff_week_note" UNIQUE ("companyId", "week_start_date"),
        CONSTRAINT "FK_staff_week_note_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_week_note"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_shift_closure"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_shift_assignment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_compensation_profile"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "staff_compensation_profile_pay_type_enum"`);
  }
}
