import { MigrationInterface, QueryRunner } from 'typeorm';

/** Interesados de /soy-atleta (online o gimnasio presencial). */
export class AddAthleteProgramLeads1752800000000 implements MigrationInterface {
  name = 'AddAthleteProgramLeads1752800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS athlete_program_lead (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(254) NOT NULL,
        phone_e164 VARCHAR(20) NOT NULL,
        phone_raw VARCHAR(40) NOT NULL,
        name VARCHAR(120) NOT NULL,
        modality VARCHAR(20) NOT NULL,
        program_interest VARCHAR(160),
        message VARCHAR(400),
        utm_source VARCHAR(200),
        utm_medium VARCHAR(200),
        utm_campaign VARCHAR(200),
        utm_content VARCHAR(200),
        utm_term VARCHAR(200),
        referrer VARCHAR(500),
        landing_url VARCHAR(500),
        source VARCHAR(40) NOT NULL DEFAULT 'soy-atleta',
        consent_contact BOOLEAN NOT NULL,
        consent_at TIMESTAMPTZ NOT NULL,
        consent_text_version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        status_changed_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_athlete_program_lead_email UNIQUE (email),
        CONSTRAINT chk_athlete_program_lead_modality CHECK (
          modality IN ('online', 'presencial')
        ),
        CONSTRAINT chk_athlete_program_lead_status CHECK (
          status IN ('new', 'contacted', 'evaluation', 'enrolled', 'not_now')
        )
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_athlete_program_lead_status_created
      ON athlete_program_lead (status, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_athlete_program_lead_modality_created
      ON athlete_program_lead (modality, created_at);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS athlete_program_lead_attempt (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ip_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_athlete_program_lead_attempt_ip_created
      ON athlete_program_lead_attempt (ip_hash, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS athlete_program_lead_attempt;`);
    await queryRunner.query(`DROP TABLE IF EXISTS athlete_program_lead;`);
  }
}
