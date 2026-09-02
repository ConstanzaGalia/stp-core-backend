ALTER TABLE payment_plans
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'ARS';

UPDATE payment_plans p
SET currency = COALESCE(NULLIF(c.default_currency, ''), 'ARS')
FROM company c
WHERE p."companyId" = c.id;
