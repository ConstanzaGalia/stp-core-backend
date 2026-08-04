-- Versionado y snapshots inmutables para criterios CMJ y fotocélulas.
-- Ejecutar una vez en instalaciones que ya tengan evaluation_criteria_set.

ALTER TABLE evaluation_criteria_set
  ADD COLUMN IF NOT EXISTS sex VARCHAR(30),
  ADD COLUMN IF NOT EXISTS protocol_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS version VARCHAR(30) NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sample_size INT;

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_protocol_active
  ON evaluation_criteria_set (test_type, protocol_code, is_active);

ALTER TABLE physical_evaluation
  ADD COLUMN IF NOT EXISTS classification_snapshot JSONB;

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
