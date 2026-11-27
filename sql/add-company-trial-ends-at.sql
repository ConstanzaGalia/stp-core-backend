-- Fin de prueba gratuita del centro (alta self-service desde la landing).
-- NULL = sin prueba en curso (centro activado por STP o con el onboarding ya pago).
-- Ejecutar UNA sola vez en producción (o usar la migración 1752700000000-AddCompanyTrial).

ALTER TABLE company
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;
