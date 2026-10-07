import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranches1751800000000 implements MigrationInterface {
  name = 'AddBranches1751800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branch (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        address VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_primary BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_branch_company ON branch (company_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_one_primary
      ON branch (company_id)
      WHERE is_primary = true
    `);

    await queryRunner.query(`
      ALTER TABLE company
      ADD COLUMN IF NOT EXISTS multi_branch_enabled BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_branch_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
        stock_deposit INT NOT NULL DEFAULT 0,
        stock_fridge INT NOT NULL DEFAULT 0,
        stock_counter INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT uq_product_branch_stock UNIQUE (product_id, branch_id)
      )
    `);

    const branchColumns: Array<{ table: string; column?: string }> = [
      { table: 'athlete_invitations', column: 'home_branch_id' },
      { table: 'payment' },
      { table: 'payment_plans' },
      { table: 'expense' },
      { table: 'fixed_expense_template' },
      { table: 'time_slot' },
      { table: 'schedule_config' },
      { table: 'schedule_resource' },
      { table: 'schedule_exception' },
      { table: 'athlete_schedules' },
      { table: 'sale' },
      { table: 'staff_shift_assignment' },
      { table: 'staff_shift_closure' },
      { table: 'staff_week_note' },
      { table: 'time_slot_generation' },
    ];

    for (const { table, column } of branchColumns) {
      const col = column ?? 'branch_id';
      await queryRunner.query(`
        DO $$
        DECLARE t text;
        BEGIN
          SELECT c.relname INTO t
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND lower(c.relname) = lower('${table}')
          LIMIT 1;
          IF t IS NULL THEN
            RAISE EXCEPTION 'No se encontró la tabla %', '${table}';
          END IF;
          EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I uuid REFERENCES branch(id) ON DELETE SET NULL',
            t,
            '${col}'
          );
        END $$;
      `);
    }

    await queryRunner.query(`
      ALTER TABLE expense
      ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE fixed_expense_template
      ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`ALTER TABLE staff_shift_assignment DROP CONSTRAINT IF EXISTS "UQ_staff_shift_assignment"`);
    await queryRunner.query(`ALTER TABLE staff_shift_closure DROP CONSTRAINT IF EXISTS "UQ_staff_shift_closure"`);
    await queryRunner.query(`
      DO $$
      DECLARE c name;
      BEGIN
        FOR c IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'staff_week_note'::regclass AND contype = 'u'
        LOOP
          EXECUTE format('ALTER TABLE staff_week_note DROP CONSTRAINT %I', c);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_shift_assignment_branch
      ON staff_shift_assignment (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        date,
        "startTime",
        "userId"
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_shift_closure_branch
      ON staff_shift_closure (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        date,
        "startTime"
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_week_note_branch
      ON staff_week_note (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        week_start_date
      )
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_config_company_day_no_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_config_company_day_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slot_company_date_start_no_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slot_company_date_start_resource`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_config_branch_day_no_resource
      ON schedule_config (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        "dayOfWeek"
      )
      WHERE resource_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_config_branch_day_resource
      ON schedule_config (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        "dayOfWeek",
        resource_id
      )
      WHERE resource_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slot_branch_date_start_no_resource
      ON time_slot (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        date,
        "startTime",
        "isIntermediateSlot"
      )
      WHERE resource_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slot_branch_date_start_resource
      ON time_slot (
        "companyId",
        (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        date,
        "startTime",
        resource_id,
        "isIntermediateSlot"
      )
      WHERE resource_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slot_branch_date_start_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slot_branch_date_start_no_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_config_branch_day_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_schedule_config_branch_day_no_resource`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_staff_week_note_branch`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_staff_shift_closure_branch`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_staff_shift_assignment_branch`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_branch_stock`);
    await queryRunner.query(`ALTER TABLE company DROP COLUMN IF EXISTS multi_branch_enabled`);
    await queryRunner.query(`DROP TABLE IF EXISTS branch CASCADE`);
  }
}
