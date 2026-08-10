-- Criterios fotocélulas Hockey Mayor Damas · Sprint 10 m.
-- Idempotente: ON CONFLICT (code) DO NOTHING.
-- Verde ≤ 2.00 s · Amarillo ≤ 2.12 s · Rojo > 2.12 s
-- v/a derivadas (partida detenida): v = d/t · a = 2d/t²

INSERT INTO evaluation_criteria_set (
  code, name, sport, age_group, sex, test_type, protocol_code, version,
  source, description, thresholds, is_active
)
VALUES (
  'hockey_mayor_female_sprint_10m_v1',
  'Hockey Mayor Damas · Sprint 10 m · v1.0',
  'hockey',
  'mayor',
  'female',
  'photocells',
  'sprint_10m',
  '1.0',
  'manual',
  'Referencia práctica inicial para Sprint 10 m (Hockey Mayor Damas).',
  '{
    "bestTimeSeconds": {
      "greenMax": 2.00,
      "yellowMax": 2.12,
      "unit": "s",
      "direction": "LOWER_IS_BETTER",
      "higherIsBetter": false,
      "messages": {
        "green": [
          "Excelente rendimiento de aceleración en 10 metros.",
          "La marca evidencia una salida y primeros metros destacados.",
          "El tiempo alcanzado representa una fortaleza clara en aceleración corta."
        ],
        "yellow": [
          "Buen rendimiento en 10 m, con margen para seguir reduciendo la marca.",
          "La aceleración inicial es adecuada y todavía puede evolucionar.",
          "El tiempo se encuentra en un nivel competitivo, con espacio de mejora."
        ],
        "red": [
          "El desarrollo de la aceleración en 10 m será un objetivo prioritario.",
          "Conviene orientar el próximo período a mejorar arranques y primeros metros.",
          "La marca muestra una oportunidad concreta para desarrollar la aceleración corta."
        ]
      }
    },
    "avgVelocityMps": {
      "greenMin": 5.00,
      "yellowMin": 4.72,
      "unit": "m/s",
      "direction": "HIGHER_IS_BETTER",
      "higherIsBetter": true,
      "messages": {
        "green": [
          "Velocidad media excelente en el sprint de 10 m.",
          "La producción de velocidad en el tramo corto es una fortaleza."
        ],
        "yellow": [
          "Velocidad media adecuada en 10 m, con margen de mejora.",
          "Hay espacio para mejorar la eficiencia de los primeros metros."
        ],
        "red": [
          "La velocidad media en 10 m es un objetivo prioritario de desarrollo.",
          "Conviene trabajar arranques y producción de velocidad en tramos cortos."
        ]
      }
    },
    "avgAccelerationMps2": {
      "greenMin": 5.00,
      "yellowMin": 4.45,
      "unit": "m/s²",
      "direction": "HIGHER_IS_BETTER",
      "higherIsBetter": true,
      "messages": {
        "green": [
          "Aceleración media excelente desde partida detenida en 10 m.",
          "La capacidad de generar velocidad en la salida es una fortaleza."
        ],
        "yellow": [
          "Aceleración adecuada en 10 m, con potencial de mejora en la fase inicial.",
          "El nivel es competitivo; el trabajo específico puede subir la marca."
        ],
        "red": [
          "La aceleración en 10 m será un foco prioritario del próximo bloque.",
          "Conviene enfatizar arranques y producción de fuerza horizontal."
        ]
      }
    }
  }'::jsonb,
  TRUE
)
ON CONFLICT (code) DO NOTHING;
