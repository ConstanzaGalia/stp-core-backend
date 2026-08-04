-- Catálogo de criterios de interpretación (CMJ y futuros tests).
-- Ejecutar UNA sola vez (idempotente) en producción.

CREATE TABLE IF NOT EXISTS evaluation_criteria_set (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(80) NOT NULL UNIQUE,
  name         VARCHAR(160) NOT NULL,
  sport        VARCHAR(80),
  age_group    VARCHAR(80),
  sex          VARCHAR(30),
  test_type    VARCHAR(40) NOT NULL DEFAULT 'cmj',
  protocol_code VARCHAR(80),
  version      VARCHAR(30) NOT NULL DEFAULT '1.0',
  effective_from DATE,
  effective_to DATE,
  source       VARCHAR(20) NOT NULL DEFAULT 'manual',
  sample_size  INT,
  description  TEXT,
  thresholds   JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE evaluation_criteria_set
  ADD COLUMN IF NOT EXISTS sex VARCHAR(30),
  ADD COLUMN IF NOT EXISTS protocol_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS version VARCHAR(30) NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sample_size INT;

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_set_test_active
  ON evaluation_criteria_set (test_type, is_active);

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS criteria_set_id UUID REFERENCES evaluation_criteria_set(id) ON DELETE SET NULL;

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS classification_snapshot JSONB;

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
ON CONFLICT (code) DO NOTHING;

-- Referencia práctica inicial entregada para Hockey Mayor Damas, Sprint 30 m.
INSERT INTO evaluation_criteria_set (
  code, name, sport, age_group, sex, test_type, protocol_code, version,
  source, description, thresholds, is_active
)
VALUES (
  'hockey_mayor_female_sprint_30m_v1',
  'Hockey Mayor Damas · Sprint 30 m · v1.0',
  'hockey',
  'mayor',
  'female',
  'photocells',
  'sprint_30m',
  '1.0',
  'manual',
  'Referencia práctica inicial para Sprint 30 m.',
  '{
    "bestTimeSeconds": {
      "greenMax": 4.70,
      "yellowMax": 4.95,
      "unit": "s",
      "direction": "LOWER_IS_BETTER",
      "higherIsBetter": false,
      "messages": {
        "green": [
          "Excelente rendimiento de aceleración en 30 metros.",
          "La marca evidencia una capacidad de aceleración destacada.",
          "El tiempo alcanzado representa una fortaleza clara en velocidad."
        ],
        "yellow": [
          "Buen rendimiento de velocidad, con margen para seguir reduciendo la marca.",
          "La aceleración es adecuada y todavía puede evolucionar con trabajo específico.",
          "El tiempo se encuentra en un nivel competitivo, con espacio de mejora."
        ],
        "red": [
          "El desarrollo de la aceleración será un objetivo prioritario.",
          "Conviene orientar el próximo período a mejorar la producción de velocidad.",
          "La marca muestra una oportunidad concreta para desarrollar la aceleración."
        ]
      }
    }
  }'::jsonb,
  TRUE
)
ON CONFLICT (code) DO NOTHING;
