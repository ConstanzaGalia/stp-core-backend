-- Apply: cancela suscripciones active/paused cuyo alumno ya tiene invitación left
-- en el mismo centro y no tiene otra approved. No borra pagos, créditos ni reservas.
--
-- Correr preview-cancel-subscriptions-for-left-athletes.sql antes.
-- Ejecutar dentro de una transacción.

BEGIN;

WITH to_cancel AS (
  SELECT s.id
  FROM user_payment_subscriptions s
  WHERE s.status IN ('active', 'paused')
    AND EXISTS (
      SELECT 1
      FROM athlete_invitations i
      WHERE i."userId" = s."userId"
        AND i."companyId" = s."companyId"
        AND i.status = 'left'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM athlete_invitations i2
      WHERE i2."userId" = s."userId"
        AND i2."companyId" = s."companyId"
        AND i2.status = 'approved'
    )
)
UPDATE user_payment_subscriptions s
SET
  status = 'cancelled',
  "autoRenew" = false,
  "updatedAt" = NOW()
FROM to_cancel t
WHERE s.id = t.id;

-- Verificar filas afectadas antes de COMMIT.
-- SELECT COUNT(*) FROM user_payment_subscriptions s
-- WHERE s.status = 'cancelled'
--   AND EXISTS (
--     SELECT 1 FROM athlete_invitations i
--     WHERE i."userId" = s."userId" AND i."companyId" = s."companyId" AND i.status = 'left'
--   );

COMMIT;
