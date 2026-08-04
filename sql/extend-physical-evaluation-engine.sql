-- Extiende physical_evaluation para el Motor de Evaluaciones + measurements tipados.
-- Ejecutar UNA sola vez en producción (idempotente).

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS device VARCHAR(40);

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS protocol_code VARCHAR(80);

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS attempt INT;

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS derived_metrics JSONB;

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Legacy force / sin device → force_platform
UPDATE physical_evaluation
SET device = 'force_platform'
WHERE device IS NULL;

CREATE INDEX IF NOT EXISTS idx_physical_evaluation_device
  ON physical_evaluation (device);

CREATE INDEX IF NOT EXISTS idx_physical_evaluation_protocol_code
  ON physical_evaluation (protocol_code);

CREATE TABLE IF NOT EXISTS physical_evaluation_measurement (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id   UUID NOT NULL REFERENCES physical_evaluation(id) ON DELETE CASCADE,
  partial         INT,
  distance        DOUBLE PRECISION,
  time            DOUBLE PRECISION,
  velocity        DOUBLE PRECISION,
  acceleration    DOUBLE PRECISION,
  power           DOUBLE PRECISION,
  extras          JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order      INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_physical_evaluation_measurement_eval
  ON physical_evaluation_measurement (evaluation_id, sort_order);
