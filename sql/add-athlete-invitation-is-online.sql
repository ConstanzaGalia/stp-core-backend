ALTER TABLE athlete_invitations
ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
