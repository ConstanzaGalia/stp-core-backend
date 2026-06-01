import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShoulderSafetyTags1749600000000 implements MigrationInterface {
  name = 'AddShoulderSafetyTags1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        enum_type text;
      BEGIN
        SELECT t.typname INTO enum_type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE c.relname = 'safety_tag'
          AND a.attname IN ('bodyZone', 'bodyzone')
          AND t.typtype = 'e';

        IF enum_type IS NOT NULL THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'hombro');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      INSERT INTO safety_tag (key, description, "bodyZone")
      VALUES
        ('no_abduccion_hombro', 'Evita abducción de hombro (vuelos laterales, elevaciones laterales)', 'hombro'),
        ('no_rotacion_externa_carga', 'Evita rotación externa bajo carga (manguito rotador)', 'hombro'),
        ('no_rotacion_interna_carga', 'Evita rotación interna bajo carga', 'hombro'),
        ('no_empuje_horizontal_carga', 'Evita empujes horizontales bajo carga (press banca, flexiones)', 'hombro'),
        ('no_pinzamiento_hombro', 'Evita patrones de pinzamiento subacromial (elevación >90°, press inclinado)', 'hombro'),
        ('no_inestabilidad_hombro', 'Evita posiciones de inestabilidad glenohumeral (rangos extremos, carga en posiciones inestables)', 'hombro')
      ON CONFLICT (key) DO UPDATE SET
        description = EXCLUDED.description,
        "bodyZone" = EXCLUDED."bodyZone";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM safety_tag
      WHERE key IN (
        'no_abduccion_hombro',
        'no_rotacion_externa_carga',
        'no_rotacion_interna_carga',
        'no_empuje_horizontal_carga',
        'no_pinzamiento_hombro',
        'no_inestabilidad_hombro'
      );
    `);
  }
}
