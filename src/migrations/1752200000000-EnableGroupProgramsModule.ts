import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los centros con lista explícita de módulos veían Programas grupales
 * porque el front lo heredaba de planes-entrenamiento. Al volverlo un
 * toggle independiente, se persiste el módulo para no apagarlo de golpe.
 */
export class EnableGroupProgramsModule1752200000000 implements MigrationInterface {
  name = 'EnableGroupProgramsModule1752200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE company
      SET enabled_modules = (
        SELECT jsonb_agg(DISTINCT elem)
        FROM (
          SELECT jsonb_array_elements_text(enabled_modules) AS elem
          UNION ALL
          SELECT 'programas-grupales'
        ) s
      )
      WHERE enabled_modules IS NOT NULL
        AND jsonb_typeof(enabled_modules) = 'array'
        AND jsonb_array_length(enabled_modules) > 0
        AND enabled_modules @> '["planes-entrenamiento"]'::jsonb
        AND NOT (enabled_modules @> '["programas-grupales"]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE company
      SET enabled_modules = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements_text(enabled_modules) AS elem
        WHERE elem <> 'programas-grupales'
      )
      WHERE enabled_modules IS NOT NULL
        AND jsonb_typeof(enabled_modules) = 'array'
        AND enabled_modules @> '["planes-entrenamiento"]'::jsonb
        AND enabled_modules @> '["programas-grupales"]'::jsonb
    `);
  }
}
