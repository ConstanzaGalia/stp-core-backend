-- Agrega el tipo de cuenta a la tabla company.
-- Ejecutar UNA sola vez en producción.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_account_type_enum') THEN
    CREATE TYPE company_account_type_enum AS ENUM ('training_center', 'sports_club');
  END IF;
END
$$;

ALTER TABLE company
  ADD COLUMN IF NOT EXISTS account_type company_account_type_enum NOT NULL DEFAULT 'training_center';
