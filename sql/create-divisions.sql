-- Crea las tablas de divisiones para clubs deportivos.
-- Ejecutar UNA sola vez en producción.

CREATE TABLE IF NOT EXISTS divisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  company_id  UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS division_coaches (
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (division_id, user_id)
);
