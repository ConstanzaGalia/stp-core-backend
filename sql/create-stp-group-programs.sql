-- Programas grupales (mesociclos) + microciclos + inscripciones + vínculo en sesiones

CREATE TABLE IF NOT EXISTS stp_group_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  short_name VARCHAR(40),
  description TEXT,
  phase VARCHAR(50) NOT NULL DEFAULT 'adaptacion',
  start_date DATE NOT NULL,
  weeks_count INT NOT NULL DEFAULT 4,
  sessions_per_week INT NOT NULL DEFAULT 3,
  training_days INT[] NOT NULL DEFAULT '{0,2,4}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by_user_id UUID,
  created_by_name TEXT,
  last_edited_by_user_id UUID,
  last_edited_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stp_group_program_company
  ON stp_group_programs(company_id);
CREATE INDEX IF NOT EXISTS idx_stp_group_program_company_status
  ON stp_group_programs(company_id, status);

CREATE TABLE IF NOT EXISTS stp_group_program_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES stp_group_programs(id) ON DELETE CASCADE,
  week_index INT NOT NULL,
  day_of_week INT,
  session_ordinal INT NOT NULL DEFAULT 1,
  workout_template_id UUID NOT NULL REFERENCES stp_workout_templates(id),
  week_type VARCHAR(20) NOT NULL DEFAULT 'carga',
  prescription_overrides JSONB,
  notes TEXT,
  UNIQUE (program_id, week_index, session_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_stp_group_program_slot_program
  ON stp_group_program_slots(program_id, week_index);

CREATE TABLE IF NOT EXISTS stp_group_program_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES stp_group_programs(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  start_week_index INT NOT NULL DEFAULT 1,
  training_days INT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_stp_group_program_enrollment_program
  ON stp_group_program_enrollments(program_id, status);
CREATE INDEX IF NOT EXISTS idx_stp_group_program_enrollment_athlete
  ON stp_group_program_enrollments(athlete_id, status);

ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS group_program_id UUID NULL REFERENCES stp_group_programs(id) ON DELETE SET NULL;
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS group_program_slot_id UUID NULL REFERENCES stp_group_program_slots(id) ON DELETE SET NULL;
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS is_customized BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_stp_session_group_program
  ON stp_session_instances(group_program_id, athlete_id);
