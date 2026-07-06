-- Posiciones deportivas personalizables por club.
-- Ejecutar UNA sola vez en producción.

CREATE TABLE IF NOT EXISTS sport_positions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  company_id  UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE athlete_invitations
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES sport_positions(id) ON DELETE SET NULL;
