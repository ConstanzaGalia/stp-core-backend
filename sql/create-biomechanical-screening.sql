-- Functional Screening Biomecánico STP
CREATE TABLE IF NOT EXISTS biomechanical_screening_protocol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL,
  version INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS biomechanical_screening_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  protocol_id UUID NOT NULL REFERENCES biomechanical_screening_protocol(id) ON DELETE RESTRICT,
  evaluation_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  current_test_code VARCHAR(80),
  notes TEXT,
  protocol_snapshot JSONB,
  summary_report JSONB,
  full_report JSONB,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  pain_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biomechanical_screening_session_user
ON biomechanical_screening_session (user_id, evaluation_date DESC);

CREATE TABLE IF NOT EXISTS biomechanical_screening_test_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES biomechanical_screening_session(id) ON DELETE CASCADE,
  test_code VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  quantitative JSONB,
  observations JSONB NOT NULL DEFAULT '{}'::jsonb,
  compensations TEXT[] NOT NULL DEFAULT '{}'::text[],
  primary_compensation VARCHAR(80),
  side_results JSONB,
  attempts JSONB,
  video_url VARCHAR(500),
  notes TEXT,
  score FLOAT,
  max_score FLOAT,
  classification VARCHAR(20),
  has_pain BOOLEAN NOT NULL DEFAULT false,
  invalid_reasons TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (session_id, test_code)
);
