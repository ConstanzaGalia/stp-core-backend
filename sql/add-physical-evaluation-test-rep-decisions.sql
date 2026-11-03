-- Decisiones del entrenador sobre repeticiones de un test (registro append-only).
-- Cada entrada: { index, override: 'include' | 'exclude' | null, by, at, reason }.
-- La última entrada de cada repetición es la vigente; null = vuelve a la regla automática.
-- Ejecutar ANTES de desplegar el código que lee la columna (idempotente).

ALTER TABLE physical_evaluation_test
  ADD COLUMN IF NOT EXISTS repetition_decisions JSONB NOT NULL DEFAULT '[]'::jsonb;
