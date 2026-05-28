-- Permite crear centros sin logo ni colores (campos opcionales en la app).
-- Ejecutar una vez en la base de datos de producción/staging.

ALTER TABLE company
  ALTER COLUMN image DROP NOT NULL,
  ALTER COLUMN primary_color DROP NOT NULL,
  ALTER COLUMN secondary_color DROP NOT NULL;
