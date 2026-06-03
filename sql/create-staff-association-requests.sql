-- Solicitudes de staff (entrenador/secretaria) para unirse a un centro.
-- Columnas alineadas con TypeORM (camelCase). Reutiliza el enum de athlete_invitations si ya existe.
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
