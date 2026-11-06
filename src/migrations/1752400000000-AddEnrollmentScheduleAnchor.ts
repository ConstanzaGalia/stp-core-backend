import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha de ancla personal: cada alumno empieza la sesión 1 desde su propia semana,
 * aunque el programa grupal haya arrancado antes.
 */
export class AddEnrollmentScheduleAnchor1752400000000 implements MigrationInterface {
  name = 'AddEnrollmentScheduleAnchor1752400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_group_program_enrollments
        ADD COLUMN IF NOT EXISTS schedule_anchor_date date NULL
    `);
    await queryRunner.query(`
      UPDATE stp_group_program_enrollments e
      SET schedule_anchor_date = p.start_date
      FROM stp_group_programs p
      WHERE e.program_id = p.id
        AND e.schedule_anchor_date IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE stp_group_program_enrollments
        ALTER COLUMN schedule_anchor_date SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stp_group_program_enrollments
        DROP COLUMN IF EXISTS schedule_anchor_date
    `);
  }
}
