-- Biblioteca de workouts por centro + visibilidad/borrador y auditoría de asistencia en sesiones STP
-- Mirror de: src/migrations/1751200000000-AddWorkoutTemplatesAndSessionVisibility.ts

CREATE TABLE IF NOT EXISTS stp_workout_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  phase VARCHAR(50),
  pattern VARCHAR(30),
  tags TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  blocks JSONB NOT NULL DEFAULT '[]',
  endurance_format VARCHAR(20),
  endurance_config JSONB,
  created_by_user_id UUID,
  created_by_name TEXT,
  last_edited_by_user_id UUID,
  last_edited_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stp_workout_template_company
  ON stp_workout_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_stp_workout_template_company_active
  ON stp_workout_templates(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stp_workout_template_company_sort
  ON stp_workout_templates(company_id, sort_order);

ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS coach_status VARCHAR(20) NOT NULL DEFAULT 'published';
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS source_workout_template_id UUID NULL;
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS safety_conflicts JSONB NOT NULL DEFAULT '[]';
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS attendance_marked_by_user_id UUID NULL;
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS attendance_marked_by_name TEXT NULL;
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ NULL;
ALTER TABLE stp_session_instances
  ADD COLUMN IF NOT EXISTS attendance_source VARCHAR(40) NULL;

CREATE INDEX IF NOT EXISTS idx_stp_session_coach_status
  ON stp_session_instances(athlete_id, coach_status);
