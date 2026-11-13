ALTER TABLE stp_training_profiles
  ADD COLUMN IF NOT EXISTS internal_notes TEXT DEFAULT NULL;
