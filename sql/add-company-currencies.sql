ALTER TABLE company
  ADD COLUMN IF NOT EXISTS enabled_currencies jsonb DEFAULT '["ARS"]'::jsonb;

ALTER TABLE company
  ADD COLUMN IF NOT EXISTS default_currency varchar(3) NOT NULL DEFAULT 'ARS';

-- Centros que ya operaban en USD siguen viendo esa moneda en caja.
UPDATE company c
SET enabled_currencies = '["ARS","USD"]'::jsonb
WHERE (
  EXISTS (
    SELECT 1 FROM expense e
    WHERE e."companyId" = c.id AND UPPER(e.currency) = 'USD'
  )
  OR EXISTS (
    SELECT 1 FROM extra_income i
    WHERE i."companyId" = c.id AND UPPER(i.currency) = 'USD'
  )
  OR EXISTS (
    SELECT 1 FROM fixed_expense_template t
    WHERE t."companyId" = c.id AND UPPER(t.default_currency) = 'USD'
  )
);
