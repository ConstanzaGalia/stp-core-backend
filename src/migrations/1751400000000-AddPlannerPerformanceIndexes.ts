import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices para acelerar listado de sesiones STP y sync de asistencia con turnos.
 */
export class AddPlannerPerformanceIndexes1751400000000
  implements MigrationInterface
{
  name = 'AddPlannerPerformanceIndexes1751400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_session_athlete_scheduled
      ON stp_session_instances (athlete_id, scheduled_date)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reservation_userid
      ON reservation ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_time_slot_date
      ON time_slot (date)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_time_slot_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reservation_userid`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_stp_session_athlete_scheduled`,
    );
  }
}
