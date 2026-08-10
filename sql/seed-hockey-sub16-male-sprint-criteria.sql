-- Criterios fotocélulas Hockey Sub-16 Masculino (Sprint 10 m y 30 m).
-- Idempotente: ON CONFLICT (code) DO NOTHING.
-- Ejecutar en la DB de trabajo cuando se necesiten estos sets.

-- Sprint 30 m
-- Verde ≤ 4.20 s · Amarillo ≤ 4.45 s · Rojo > 4.45 s
-- v/a derivadas (partida detenida): v = d/t · a = 2d/t²
INSERT INTO evaluation_criteria_set (
  code, name, sport, age_group, sex, test_type, protocol_code, version,
  source, description, thresholds, is_active
)
VALUES (
  'hockey_sub16_male_sprint_30m_v1',
  'Hockey Sub-16 Masculino · Sprint 30 m · v1.0',
  'hockey',
  'sub16',
  'male',
  'photocells',
  'sprint_30m',
  '1.0',
  'manual',
  'Referencia práctica Sub-16 masculino hockey · Sprint 30 m (partida detenida).',
  '{
    "bestTimeSeconds": {
      "greenMax": 4.20,
      "yellowMax": 4.45,
      "unit": "s",
      "direction": "LOWER_IS_BETTER",
      "higherIsBetter": false,
      "messages": {
        "green": [
          "Excelente rendimiento de aceleración en 30 metros para Sub-16 masculino.",
          "La marca evidencia una capacidad de aceleración destacada.",
          "El tiempo alcanzado representa una fortaleza clara en velocidad."
        ],
        "yellow": [
          "Buen rendimiento de velocidad, con margen para seguir reduciendo la marca.",
          "La aceleración es adecuada y todavía puede evolucionar con trabajo específico.",
          "El tiempo se encuentra en un nivel competitivo juvenil, con espacio de mejora."
        ],
        "red": [
          "El desarrollo de la aceleración será un objetivo prioritario.",
          "Conviene orientar el próximo período a mejorar la producción de velocidad.",
          "La marca muestra una oportunidad concreta para desarrollar la aceleración en 30 m."
        ]
      }
    },
    "avgVelocityMps": {
      "greenMin": 7.14,
      "yellowMin": 6.74,
      "unit": "m/s",
      "direction": "HIGHER_IS_BETTER",
      "higherIsBetter": true,
      "messages": {
        "green": [
          "Velocidad media excelente en el sprint de 30 m.",
          "La producción de velocidad se ubica en un nivel destacado para Sub-16."
        ],
        "yellow": [
          "Velocidad media adecuada, con margen para seguir subiendo la marca.",
          "Hay espacio para mejorar la eficiencia de aceleración y la velocidad media."
        ],
        "red": [
          "La velocidad media es un objetivo prioritario de desarrollo.",
          "Conviene trabajar la producción de velocidad en tramos cortos."
        ]
      }
    },
    "avgAccelerationMps2": {
      "greenMin": 3.40,
      "yellowMin": 3.03,
      "unit": "m/s²",
      "direction": "HIGHER_IS_BETTER",
      "higherIsBetter": true,
      "messages": {
        "green": [
          "Aceleración media excelente desde partida detenida.",
          "La capacidad de generar velocidad en los primeros metros es una fortaleza."
        ],
        "yellow": [
          "Aceleración adecuada, con potencial de mejora en la fase inicial del sprint.",
          "El nivel es competitivo; el trabajo específico puede subir la marca."
        ],
        "red": [
          "La aceleración media será un foco prioritario del próximo bloque.",
          "Conviene enfatizar arranques y producción de fuerza horizontal."
        ]
      }
    }
  }'::jsonb,
  TRUE
)
ON CONFLICT (code) DO NOTHING;

-- Sprint 10 m
-- Verde ≤ 1.75 s · Amarillo ≤ 1.90 s · Rojo > 1.90 s
INSERT INTO evaluation_criteria_set (
  code, name, sport, age_group, sex, test_type, protocol_code, version,
  source, description, thresholds, is_active
)
VALUES (
  'hockey_sub16_male_sprint_10m_v1',
  'Hockey Sub-16 Masculino · Sprint 10 m · v1.0',
  'hockey',
  'sub16',
  'male',
  'photocells',
  'sprint_10m',
  '1.0',
  'manual',
  'Referencia práctica Sub-16 masculino hockey · Sprint 10 m (partida detenida).',
  '{
    "bestTimeSeconds": {
      "greenMax": 1.75,
      "yellowMax": 1.90,
      "unit": "s",
      "direction": "LOWER_IS_BETTER",
      "higherIsBetter": false,
      "messages": {
        "green": [
          "Excelente rendimiento de aceleración en 10 metros para Sub-16 masculino.",
          "La marca evidencia una salida y primeros metros destacados.",
          "El tiempo alcanzado representa una fortaleza clara en aceleración corta."
        ],
        "yellow": [
          "Buen rendimiento en 10 m, con margen para seguir reduciendo la marca.",
          "La aceleración inicial es adecuada y todavía puede evolucionar.",
          "El tiempo se encuentra en un nivel competitivo juvenil, con espacio de mejora."
        ],
        "red": [
          "El desarrollo de la aceleración en 10 m será un objetivo prioritario.",
          "Conviene orientar el próximo período a mejorar arranques y primeros metros.",
          "La marca muestra una oportunidad concreta para desarrollar la aceleración corta."
        ]
      }
    },
    "avgVelocityMps": {
      "greenMin": 5.71,
      "yellowMin": 5.26,
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
      "greenMin": 6.53,
      "yellowMin": 5.54,
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
