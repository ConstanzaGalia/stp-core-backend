-- Módulos habilitados por centro (accesos directos del dashboard).
-- NULL = todos habilitados (compatibilidad con centros existentes).
-- Ejecutar UNA sola vez en producción.

ALTER TABLE company
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb DEFAULT NULL;
