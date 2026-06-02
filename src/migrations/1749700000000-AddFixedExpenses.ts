import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFixedExpenses1749700000000 implements MigrationInterface {
  name = 'AddFixedExpenses1749700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "fixed_expense_month_status_status_enum" AS ENUM ('pending', 'paid', 'na', 'no')
    `);
    await queryRunner.query(`
      CREATE TYPE "fixed_expense_month_status_source_enum" AS ENUM ('manual', 'expense')
    `);

    await queryRunner.query(`
      CREATE TABLE "fixed_expense_template" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(150) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "default_category" character varying(100),
        "default_currency" character varying(3) NOT NULL DEFAULT 'ARS',
        "is_active" boolean NOT NULL DEFAULT true,
        "companyId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fixed_expense_template" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fixed_expense_template_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fixed_expense_month_status" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "status" "fixed_expense_month_status_status_enum" NOT NULL DEFAULT 'pending',
        "source" "fixed_expense_month_status_source_enum",
        "note" character varying(255),
        "companyId" uuid NOT NULL,
        "templateId" uuid NOT NULL,
        "expenseId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fixed_expense_month_status" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fixed_expense_month_status" UNIQUE ("companyId", "templateId", "year", "month"),
        CONSTRAINT "FK_fixed_expense_month_status_company" FOREIGN KEY ("companyId")
          REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fixed_expense_month_status_template" FOREIGN KEY ("templateId")
          REFERENCES "fixed_expense_template"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fixed_expense_month_status_expense" FOREIGN KEY ("expenseId")
          REFERENCES "expense"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "expense"
      ADD COLUMN IF NOT EXISTS "fixedExpenseTemplateId" uuid,
      ADD CONSTRAINT "FK_expense_fixed_expense_template" FOREIGN KEY ("fixedExpenseTemplateId")
        REFERENCES "fixed_expense_template"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense" DROP CONSTRAINT IF EXISTS "FK_expense_fixed_expense_template"
    `);
    await queryRunner.query(`
      ALTER TABLE "expense" DROP COLUMN IF EXISTS "fixedExpenseTemplateId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "fixed_expense_month_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fixed_expense_template"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fixed_expense_month_status_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fixed_expense_month_status_status_enum"`);
  }
}
