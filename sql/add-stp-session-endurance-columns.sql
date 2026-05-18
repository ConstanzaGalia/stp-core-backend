-- Run once in Supabase / Postgres before deploying entity changes that read/write these columns.
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS endurance_format varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS endurance_config jsonb NULL;
