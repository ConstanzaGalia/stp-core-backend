-- Ejecutar en Supabase SQL Editor (NO pegar archivos .ts de TypeORM).
-- Desbloquea login + club deportivo + staff association cuando migration:run está atascado.

-- 1) Tipo de cuenta (CRÍTICO: sin esto GET /company/user/:id devuelve vacío)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_account_type_enum') THEN
    CREATE TYPE company_account_type_enum AS ENUM ('training_center', 'sports_club');
  END IF;
END $$;

ALTER TABLE company
  ADD COLUMN IF NOT EXISTS account_type company_account_type_enum NOT NULL DEFAULT 'training_center';

-- 2) Tokens auth (migración 175010)
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "active_token_expires_at" TIMESTAMP NULL;
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "reset_password_token_expires_at" TIMESTAMP NULL;

-- 3) Staff association requests (migración 175020)
CREATE TABLE IF NOT EXISTS staff_association_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  message TEXT,
  "companyResponse" TEXT,
  "approvedAt" TIMESTAMP,
  "rejectedAt" TIMESTAMP,
  "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "companyId" UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_association_requests_company_status
  ON staff_association_requests ("companyId", status);
CREATE INDEX IF NOT EXISTS idx_staff_association_requests_user_company
  ON staff_association_requests ("userId", "companyId");

-- 4) Atletas online (migración 175000)
ALTER TABLE athlete_invitations
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

-- 5) Divisiones (club deportivo)
CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS division_coaches (
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (division_id, user_id)
);
ALTER TABLE athlete_invitations
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE SET NULL;

-- Verificación:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'company' AND column_name = 'account_type';
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'athlete_invitations'
--   AND column_name IN ('is_online', 'division_id');
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'divisions' ORDER BY ordinal_position;

-- 6) Motor de Evaluaciones (ejecutar también los scripts dedicados):
--    sql/create-evaluation-protocols.sql
--    sql/extend-physical-evaluation-engine.sql
--    sql/create-evaluation-criteria-sets.sql
--    sql/create-manual-strength-protocol.sql

-- 7) Club de origen del atleta (sports_club)
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS club_name VARCHAR(200) NULL;

-- 8) Portal Analytics de evaluaciones (participantes solo-eval + flag de acceso)
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS evaluation_portal_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "user".evaluation_portal_only IS
  'Si true, el atleta usa el portal Analytics de evaluaciones (layout reducido)';

-- 9) Portal analytics entrenadores de club (ATAH)
--    Ejecutar también: sql/add-club-analytics-trainer.sql
--    Normalización opcional: sql/normalize-atah-club-names.sql
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'TRAINER_ONLY_ANALYTICS';

-- 10) Functional Screening Biomecánico STP
--     Ejecutar también: sql/create-biomechanical-screening.sql

-- 11) Historial clínico: tipo lesión/afección (migración 175060)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'injury_kind_enum') THEN
    CREATE TYPE injury_kind_enum AS ENUM ('lesion', 'afeccion', 'otro');
  END IF;
END $$;

ALTER TABLE injury
  ADD COLUMN IF NOT EXISTS kind injury_kind_enum NOT NULL DEFAULT 'lesion';

-- 12) Objetivos del atleta (migración 175070)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'athlete_objective_type_enum') THEN
    CREATE TYPE athlete_objective_type_enum AS ENUM ('single_date', 'date_range', 'annual');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS athlete_objective (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type athlete_objective_type_enum NOT NULL,
  target_date DATE,
  start_date DATE,
  end_date DATE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_objective_user
  ON athlete_objective ("userId");

-- 13) Condiciones clínicas permanentes (migración 175080)
ALTER TABLE injury
  ADD COLUMN IF NOT EXISTS permanente BOOLEAN NOT NULL DEFAULT false;

