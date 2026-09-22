import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStpPlatformBilling1751500000000 implements MigrationInterface {
  name = 'AddStpPlatformBilling1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stp_platform_plan AS ENUM ('STP_PERSONAL', 'STP_CENTER', 'STP_CLUB');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stp_platform_billing_kind AS ENUM ('PAID', 'FREE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stp_platform_subscription_status AS ENUM ('active', 'expired', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stp_platform_charge_concept AS ENUM ('SUBSCRIPTION', 'ONBOARDING');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stp_platform_charge_status AS ENUM ('pending', 'paid');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stp_platform_payment_method AS ENUM ('transfer', 'cash', 'card', 'other');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_platform_subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        plan stp_platform_plan NOT NULL,
        billing_kind stp_platform_billing_kind NOT NULL,
        status stp_platform_subscription_status NOT NULL DEFAULT 'active',
        subscription_amount DECIMAL(12, 2) NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
        period_start DATE NOT NULL,
        period_end DATE NULL,
        notes TEXT NULL,
        assigned_by_user_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_platform_sub_company_status
      ON stp_platform_subscriptions (company_id, status);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_platform_sub_period_end
      ON stp_platform_subscriptions (period_end);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stp_platform_charges (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        subscription_id UUID NULL REFERENCES stp_platform_subscriptions(id) ON DELETE SET NULL,
        concept stp_platform_charge_concept NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
        status stp_platform_charge_status NOT NULL DEFAULT 'pending',
        due_date DATE NULL,
        paid_at TIMESTAMPTZ NULL,
        method stp_platform_payment_method NULL,
        reference VARCHAR(200) NULL,
        notes TEXT NULL,
        recorded_by_user_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_platform_charge_company_status
      ON stp_platform_charges (company_id, status);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_platform_charge_company_concept
      ON stp_platform_charges (company_id, concept);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_platform_charge_due_date
      ON stp_platform_charges (due_date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stp_platform_charge_due_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stp_platform_charge_company_concept`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stp_platform_charge_company_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS stp_platform_charges`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stp_platform_sub_period_end`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stp_platform_sub_company_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS stp_platform_subscriptions`);
    await queryRunner.query(`DROP TYPE IF EXISTS stp_platform_payment_method`);
    await queryRunner.query(`DROP TYPE IF EXISTS stp_platform_charge_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS stp_platform_charge_concept`);
    await queryRunner.query(`DROP TYPE IF EXISTS stp_platform_subscription_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS stp_platform_billing_kind`);
    await queryRunner.query(`DROP TYPE IF EXISTS stp_platform_plan`);
  }
}
