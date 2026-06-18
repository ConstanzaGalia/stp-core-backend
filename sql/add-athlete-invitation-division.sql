-- Asigna la división a la que pertenece una jugadora dentro de un club deportivo.
-- Ejecutar UNA sola vez en producción (después de create-divisions.sql).

ALTER TABLE athlete_invitations
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE SET NULL;
