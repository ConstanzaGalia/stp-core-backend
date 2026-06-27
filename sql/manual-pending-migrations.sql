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
