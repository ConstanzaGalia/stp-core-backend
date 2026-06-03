-- Marcado del atleta sobre si realizó o no la sesión (pending | completed | skipped).
-- Ejecutar en Supabase/Postgres antes del deploy de la columna.

ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS athlete_completion_status varchar(20) DEFAULT 'pending';
