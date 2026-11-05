-- Modelo B: sessions_per_week + slots por session_ordinal + training_days en enrollment

ALTER TABLE stp_group_programs
  ADD COLUMN IF NOT EXISTS sessions_per_week INT NOT NULL DEFAULT 3;

UPDATE stp_group_programs
SET sessions_per_week = GREATEST(
  2,
  LEAST(5, COALESCE(cardinality(training_days), 3))
)
WHERE sessions_per_week IS NULL
   OR sessions_per_week < 2
   OR sessions_per_week > 5;

ALTER TABLE stp_group_program_enrollments
  ADD COLUMN IF NOT EXISTS training_days INT[] NOT NULL DEFAULT '{}';

UPDATE stp_group_program_enrollments e
SET training_days = COALESCE(p.training_days, '{0,2,4}'::int[])
FROM stp_group_programs p
WHERE e.program_id = p.id
  AND (e.training_days IS NULL OR cardinality(e.training_days) = 0);

-- Backfill session_ordinal from day_of_week order within each week
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY program_id, week_index
      ORDER BY day_of_week ASC NULLS LAST, session_ordinal ASC, id ASC
    ) AS rn
  FROM stp_group_program_slots
)
UPDATE stp_group_program_slots s
SET session_ordinal = ranked.rn
FROM ranked
WHERE s.id = ranked.id;

ALTER TABLE stp_group_program_slots
  ALTER COLUMN day_of_week DROP NOT NULL;

ALTER TABLE stp_group_program_slots
  DROP CONSTRAINT IF EXISTS stp_group_program_slots_program_id_week_index_day_of_week_key;

ALTER TABLE stp_group_program_slots
  DROP CONSTRAINT IF EXISTS uq_stp_group_program_slot_week_day;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_stp_group_program_slot_week_ordinal'
  ) THEN
    ALTER TABLE stp_group_program_slots
      ADD CONSTRAINT uq_stp_group_program_slot_week_ordinal
      UNIQUE (program_id, week_index, session_ordinal);
  END IF;
END $$;
