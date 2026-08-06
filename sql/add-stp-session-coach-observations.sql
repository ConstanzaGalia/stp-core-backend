ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS coach_observations TEXT DEFAULT NULL;
