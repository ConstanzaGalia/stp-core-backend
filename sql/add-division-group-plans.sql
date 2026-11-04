-- Armado de grupos por división (fuerza / carrera) a partir de las evaluaciones.
-- Ejecutar ANTES de desplegar el código que lee la tabla (idempotente).

CREATE TABLE IF NOT EXISTS division_group_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL,
  name        VARCHAR(100) NOT NULL,
  objective   VARCHAR(20)  NOT NULL,
  criteria    JSONB NOT NULL DEFAULT '{}'::jsonb,
  groups      JSONB NOT NULL DEFAULT '[]'::jsonb,
  unassigned  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_division_group_plans_division
  ON division_group_plans (division_id, updated_at DESC);
