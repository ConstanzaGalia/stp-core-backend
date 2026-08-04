-- Protocolo de evaluación manual de fuerza (tres básicos).
-- Idempotente.

INSERT INTO evaluation_protocol (code, label, device, category, config, active, sort_order)
VALUES (
  'big_three_manual',
  'Tres básicos (manual)',
  'manual',
  'strength',
  '{"testTypes":["manual_squat","manual_bench","manual_deadlift"],"lifts":["squat","bench","deadlift"],"formula":"epley_rir_v1"}'::jsonb,
  TRUE,
  300
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  device = EXCLUDED.device,
  category = EXCLUDED.category,
  config = EXCLUDED.config,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_physical_evaluation_device_protocol
  ON physical_evaluation (device, protocol_code);

CREATE INDEX IF NOT EXISTS idx_physical_evaluation_test_type
  ON physical_evaluation_test (test_type);
