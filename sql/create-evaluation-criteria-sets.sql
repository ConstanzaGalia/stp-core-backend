-- Catálogo de criterios de interpretación (CMJ y futuros tests).
-- Ejecutar UNA sola vez (idempotente) en producción.

CREATE TABLE IF NOT EXISTS evaluation_criteria_set (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(80) NOT NULL UNIQUE,
  name         VARCHAR(160) NOT NULL,
  sport        VARCHAR(80),
  age_group    VARCHAR(80),
  test_type    VARCHAR(40) NOT NULL DEFAULT 'cmj',
  description  TEXT,
  thresholds   JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_set_test_active
  ON evaluation_criteria_set (test_type, is_active);

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS criteria_set_id UUID REFERENCES evaluation_criteria_set(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_physical_evaluation_criteria_set
  ON physical_evaluation (criteria_set_id);

-- Seed Hockey Mayor – Selección (umbrales de referencia CMJ)
INSERT INTO evaluation_criteria_set (code, name, sport, age_group, test_type, description, thresholds, is_active)
VALUES (
  'hockey_mayor_seleccion',
  'Hockey Mayor – Selección',
  'hockey',
  'mayor',
  'cmj',
  'Criterios fijos para devoluciones consistentes en selección hockey mayor.',
  '{
    "altura_de_salto": { "greenMin": 35, "yellowMin": 25, "unit": "cm", "higherIsBetter": true },
    "rsi": { "greenMin": 1.2, "yellowMin": 0.9, "higherIsBetter": true },
    "eficiencia": { "greenMin": 0.7, "yellowMin": 0.6, "higherIsBetter": true },
    "asimetria_frenado": { "greenMax": 10, "yellowMax": 15, "unit": "%", "higherIsBetter": false, "useAbs": true },
    "asimetria_propulsiva": { "greenMax": 10, "yellowMax": 15, "unit": "%", "higherIsBetter": false, "useAbs": true },
    "asimetria_aterrizaje": { "greenMax": 10, "yellowMax": 15, "unit": "%", "higherIsBetter": false, "useAbs": true }
  }'::jsonb,
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sport = EXCLUDED.sport,
  age_group = EXCLUDED.age_group,
  test_type = EXCLUDED.test_type,
  description = EXCLUDED.description,
  thresholds = EXCLUDED.thresholds,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
