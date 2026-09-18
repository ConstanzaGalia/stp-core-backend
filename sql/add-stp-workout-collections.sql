-- Colecciones de workouts + collection_id en plantillas
-- Gemelo de la migración 1751300000000-AddWorkoutCollections

CREATE TABLE IF NOT EXISTS stp_workout_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID,
  created_by_name TEXT,
  last_edited_by_user_id UUID,
  last_edited_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stp_workout_collection_company
ON stp_workout_collections(company_id);

CREATE INDEX IF NOT EXISTS idx_stp_workout_collection_company_active
ON stp_workout_collections(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_stp_workout_collection_company_sort
ON stp_workout_collections(company_id, sort_order);

ALTER TABLE stp_workout_templates
ADD COLUMN IF NOT EXISTS collection_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_stp_workout_template_collection'
  ) THEN
    ALTER TABLE stp_workout_templates
    ADD CONSTRAINT fk_stp_workout_template_collection
    FOREIGN KEY (collection_id)
    REFERENCES stp_workout_collections(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stp_workout_template_collection
ON stp_workout_templates(collection_id);
