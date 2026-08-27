-- Recursos de turnos paralelos (espacios / grupos)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_resource_type_enum') THEN
    CREATE TYPE schedule_resource_type_enum AS ENUM ('space', 'group');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS schedule_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  type schedule_resource_type_enum NOT NULL DEFAULT 'space',
  default_capacity INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  division_id UUID REFERENCES divisions(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE schedule_config
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES schedule_resource(id) ON DELETE CASCADE;

ALTER TABLE time_slot
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES schedule_resource(id) ON DELETE SET NULL;

ALTER TABLE athlete_schedules
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES schedule_resource(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_config_company_day_no_resource
  ON schedule_config ("companyId", "dayOfWeek")
  WHERE resource_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_config_company_day_resource
  ON schedule_config ("companyId", "dayOfWeek", resource_id)
  WHERE resource_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slot_company_date_start_no_resource
  ON time_slot ("companyId", date, "startTime", "isIntermediateSlot")
  WHERE resource_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slot_company_date_start_resource
  ON time_slot ("companyId", date, "startTime", resource_id, "isIntermediateSlot")
  WHERE resource_id IS NOT NULL;
