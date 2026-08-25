-- Competencias para clubes deportivos (módulo competencias)
-- Ejecutar si las migraciones TypeORM no corren automáticamente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_date_type_enum') THEN
    CREATE TYPE competition_date_type_enum AS ENUM ('single_date', 'date_range');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_status_enum') THEN
    CREATE TYPE competition_status_enum AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sport VARCHAR(100) NOT NULL,
  date_type competition_date_type_enum NOT NULL,
  target_date DATE,
  start_date DATE,
  end_date DATE,
  location VARCHAR(255),
  description TEXT,
  status competition_status_enum NOT NULL DEFAULT 'PLANNED',
  result_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitions_company ON competitions (company_id);

CREATE TABLE IF NOT EXISTS competition_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (competition_id, division_id)
);

CREATE TABLE IF NOT EXISTS competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  division_id UUID REFERENCES divisions(id) ON DELETE SET NULL,
  result_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (competition_id, user_id)
);

ALTER TABLE competition_participants
  ADD COLUMN IF NOT EXISTS result_summary TEXT;

ALTER TABLE athlete_objective
  ADD COLUMN IF NOT EXISTS competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_athlete_objective_competition_user
  ON athlete_objective (competition_id, "userId")
  WHERE competition_id IS NOT NULL;

DO $$
BEGIN
  ALTER TYPE competition_status_enum ADD VALUE 'IN_PROGRESS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS competition_participant_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES competition_participants(id) ON DELETE CASCADE,
  played_at DATE,
  round_label VARCHAR(100),
  opponent VARCHAR(200),
  result_summary TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competition_participant_matches_participant
  ON competition_participant_matches (participant_id);

CREATE TABLE IF NOT EXISTS competition_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  played_at DATE,
  round_label VARCHAR(100),
  opponent VARCHAR(200),
  result_summary TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competition_matches_competition
  ON competition_matches (competition_id);
