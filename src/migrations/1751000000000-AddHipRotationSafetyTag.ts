import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHipRotationSafetyTag1751000000000 implements MigrationInterface {
  name = 'AddHipRotationSafetyTag1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO safety_tag (key, description, "bodyZone")
      VALUES
        ('no_rotacion_cadera', 'Evita rotación de cadera bajo carga', 'tren_inferior')
      ON CONFLICT (key) DO UPDATE SET
        description = EXCLUDED.description,
        "bodyZone" = EXCLUDED."bodyZone";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM safety_tag
      WHERE key = 'no_rotacion_cadera';
    `);
  }
}
