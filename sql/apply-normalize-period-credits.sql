-- Apply: normaliza classesUsedThisPeriod y classesRemainingThisPeriod
-- de las suscripciones activas con la misma regla que preview-normalize-period-credits.sql.
--
-- Correr el preview antes. Ejecutar dentro de una transacción.
-- No borra class_usage ni inventa asistencia en turnos.
--
-- Opcional: descomentar el filtro de centro en active_sub.

BEGIN;

WITH active_sub AS (
  SELECT
    s.id AS subscription_id,
    s."userId",
    s."companyId",
    s."periodStartDate"::date AS period_start,
    s."periodEndDate"::date AS period_end,
    COALESCE(p."maxClassesPerPeriod", 0) AS cupo
  FROM user_payment_subscriptions s
  LEFT JOIN payment_plans p ON p.id = s."paymentPlanId"
  WHERE s.status = 'active'
    -- AND s."companyId" = '00000000-0000-0000-0000-000000000000'
),
marked AS (
  SELECT sub.subscription_id, COUNT(*)::int AS cantidad
  FROM active_sub sub
  JOIN reservation r ON r."userId" = sub."userId"
  JOIN time_slot ts ON ts.id = r."timeSlotId"
  WHERE ts."companyId" = sub."companyId"
    AND r.attendance_status IS NOT NULL
    AND ts.date::date BETWEEN sub.period_start AND sub.period_end
  GROUP BY sub.subscription_id
),
planilla AS (
  SELECT sub.subscription_id, COUNT(DISTINCT left(sess.scheduled_date, 10))::int AS dias
  FROM active_sub sub
  JOIN stp_session_instances sess
    ON sess.athlete_id = sub."userId"::text
   AND sess.athlete_completion_status = 'completed'
   AND left(sess.scheduled_date, 10)::date BETWEEN sub.period_start AND sub.period_end
  WHERE NOT EXISTS (
    SELECT 1
    FROM reservation r
    JOIN time_slot ts ON ts.id = r."timeSlotId"
    WHERE r."userId" = sub."userId"
      AND ts."companyId" = sub."companyId"
      AND r.attendance_status IS NOT NULL
      AND ts.date::date = left(sess.scheduled_date, 10)::date
  )
  GROUP BY sub.subscription_id
),
pending AS (
  SELECT sub.subscription_id, COUNT(*)::int AS cantidad
  FROM active_sub sub
  JOIN reservation r ON r."userId" = sub."userId"
  JOIN time_slot ts ON ts.id = r."timeSlotId"
  WHERE ts."companyId" = sub."companyId"
    AND r.attendance_status IS NULL
    AND ts.date::date BETWEEN sub.period_start AND sub.period_end
  GROUP BY sub.subscription_id
),
computed AS (
  SELECT
    sub.subscription_id,
    LEAST(sub.cupo, COALESCE(m.cantidad, 0) + COALESCE(pl.dias, 0)) AS consumidas,
    GREATEST(
      0,
      sub.cupo - LEAST(sub.cupo, COALESCE(m.cantidad, 0) + COALESCE(pl.dias, 0)) - COALESCE(pe.cantidad, 0)
    ) AS libres
  FROM active_sub sub
  LEFT JOIN marked m ON m.subscription_id = sub.subscription_id
  LEFT JOIN planilla pl ON pl.subscription_id = sub.subscription_id
  LEFT JOIN pending pe ON pe.subscription_id = sub.subscription_id
)
UPDATE user_payment_subscriptions s
SET
  "classesUsedThisPeriod" = c.consumidas,
  "classesRemainingThisPeriod" = c.libres
FROM computed c
WHERE s.id = c.subscription_id;

COMMIT;
