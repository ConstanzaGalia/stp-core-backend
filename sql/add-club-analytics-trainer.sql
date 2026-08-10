-- Portal analytics ATAH: rol + tabla de accesos de entrenadores de club.
-- Ejecutar contra la DB (local / Railway / Supabase).

ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'TRAINER_ONLY_ANALYTICS';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_analytics_sex_scope_enum') THEN
    CREATE TYPE club_analytics_sex_scope_enum AS ENUM ('damas', 'caballeros', 'ambos');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS club_analytics_trainer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  club_code VARCHAR(64) NOT NULL,
  sex_scope club_analytics_sex_scope_enum NOT NULL DEFAULT 'ambos',
  created_by UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_club_analytics_trainer_user_company UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_club_analytics_trainer_company
  ON club_analytics_trainer (company_id);

CREATE INDEX IF NOT EXISTS idx_club_analytics_trainer_user
  ON club_analytics_trainer (user_id);

COMMENT ON TABLE club_analytics_trainer IS
  'Accesos de entrenadores TRAINER_ONLY_ANALYTICS al portal de analytics por club + sexo';

COMMENT ON COLUMN club_analytics_trainer.club_code IS
  'Código del catálogo ATAH (ej. club_san_martin)';

COMMENT ON COLUMN club_analytics_trainer.sex_scope IS
  'Filtro de jugadores: damas | caballeros | ambos';
