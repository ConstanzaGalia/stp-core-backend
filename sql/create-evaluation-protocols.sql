-- Catálogo de protocolos del Motor de Evaluaciones.
-- Ejecutar UNA sola vez (o de forma idempotente) en producción.

CREATE TABLE IF NOT EXISTS evaluation_protocol (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(80) NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  device      VARCHAR(40) NOT NULL,
  category    VARCHAR(40) NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_protocol_device_active
  ON evaluation_protocol (device, active, sort_order);

-- Seed fotocélulas (idempotente)
INSERT INTO evaluation_protocol (code, label, device, category, config, active, sort_order)
VALUES
  ('sprint_10m', 'Sprint 10 m', 'photocells', 'speed', '{"distanceMeters":10,"gates":[10],"testType":"photocell_sprint_10m"}'::jsonb, TRUE, 10),
  ('sprint_20m', 'Sprint 20 m', 'photocells', 'speed', '{"distanceMeters":20,"gates":[10,20],"testType":"photocell_sprint_20m"}'::jsonb, TRUE, 20),
  ('sprint_30m', 'Sprint 30 m', 'photocells', 'speed', '{"distanceMeters":30,"gates":[10,20,30],"testType":"photocell_sprint_30m"}'::jsonb, TRUE, 30),
  ('sprint_40m', 'Sprint 40 m', 'photocells', 'speed', '{"distanceMeters":40,"gates":[10,20,30,40],"testType":"photocell_sprint_40m"}'::jsonb, TRUE, 40),
  ('sprint_50m', 'Sprint 50 m', 'photocells', 'speed', '{"distanceMeters":50,"gates":[10,20,30,40,50],"testType":"photocell_sprint_50m"}'::jsonb, TRUE, 50),
  ('flying_10m', 'Flying 10 m', 'photocells', 'speed', '{"distanceMeters":10,"gates":[10],"testType":"photocell_flying_10m"}'::jsonb, TRUE, 60),
  ('flying_20m', 'Flying 20 m', 'photocells', 'speed', '{"distanceMeters":20,"gates":[10,20],"testType":"photocell_flying_20m"}'::jsonb, TRUE, 70),
  ('t_test', 'T-Test', 'photocells', 'agility', '{"testType":"photocell_t_test"}'::jsonb, TRUE, 110),
  ('test_505', '505', 'photocells', 'agility', '{"testType":"photocell_505"}'::jsonb, TRUE, 120),
  ('illinois', 'Illinois', 'photocells', 'agility', '{"testType":"photocell_illinois"}'::jsonb, TRUE, 130),
  ('rast', 'RAST', 'photocells', 'resistance', '{"testType":"photocell_rast"}'::jsonb, TRUE, 210),
  ('rsa', 'RSA', 'photocells', 'resistance', '{"testType":"photocell_rsa"}'::jsonb, TRUE, 220),
  ('big_three_manual', 'Tres básicos (manual)', 'manual', 'strength', '{"testTypes":["manual_squat","manual_bench","manual_deadlift"],"lifts":["squat","bench","deadlift"],"formula":"epley_rir_v1"}'::jsonb, TRUE, 300)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  device = EXCLUDED.device,
  category = EXCLUDED.category,
  config = EXCLUDED.config,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
