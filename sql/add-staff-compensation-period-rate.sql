-- Tarifas de compensación por mes (histórico de liquidación)
-- Ejecutar si no corrés migraciones TypeORM automáticas.

CREATE TABLE IF NOT EXISTS "staff_compensation_period_rate" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "companyId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "pay_type" "staff_compensation_profile_pay_type_enum" NOT NULL DEFAULT 'hourly',
  "hourly_rate" numeric(12,2),
  "fixed_monthly_amount" numeric(12,2),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_staff_compensation_period_rate" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_staff_compensation_period_rate" UNIQUE ("companyId", "userId", "year", "month"),
  CONSTRAINT "FK_staff_compensation_period_rate_company" FOREIGN KEY ("companyId")
    REFERENCES "company"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_staff_compensation_period_rate_user" FOREIGN KEY ("userId")
    REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "CHK_staff_compensation_period_rate_month" CHECK ("month" >= 1 AND "month" <= 12)
);

CREATE INDEX IF NOT EXISTS "IDX_staff_compensation_period_rate_company_period"
  ON "staff_compensation_period_rate" ("companyId", "year", "month");
