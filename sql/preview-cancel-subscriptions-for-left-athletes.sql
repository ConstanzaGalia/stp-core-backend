-- Preview: suscripciones active/paused de alumnos que ya salieron del centro (invitación left).
-- Excluye centros donde el alumno volvió a quedar approved.
-- No escribe nada. Correr apply-cancel-subscriptions-for-left-athletes.sql después de revisar.

SELECT
  s.id AS subscription_id,
  s.status AS subscription_status,
  s."autoRenew",
  s."startDate",
  s."endDate",
  u.id AS user_id,
  u.name,
  u.lastname,
  u.email,
  c.id AS company_id,
  c.name AS centro,
  i.status AS invitation_status,
  i."leftAt"
FROM user_payment_subscriptions s
JOIN "user" u ON u.id = s."userId"
JOIN company c ON c.id = s."companyId"
JOIN athlete_invitations i
  ON i."userId" = s."userId"
 AND i."companyId" = s."companyId"
 AND i.status = 'left'
WHERE s.status IN ('active', 'paused')
  AND NOT EXISTS (
    SELECT 1
    FROM athlete_invitations i2
    WHERE i2."userId" = s."userId"
      AND i2."companyId" = s."companyId"
      AND i2.status = 'approved'
  )
ORDER BY u.lastname, u.name, c.name;
