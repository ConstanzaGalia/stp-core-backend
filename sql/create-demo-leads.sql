-- Leads de la demo pública (/demo) y eventos del embudo.
-- Tablas nuevas e independientes: no tocan usuarios, centros ni cobros.
-- `demo_lead_attempt` guarda hashes de IP para limitar altas entre instancias.

CREATE TABLE IF NOT EXISTS demo_lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL,
  phone_e164 VARCHAR(20) NOT NULL,
  phone_raw VARCHAR(40) NOT NULL,
  name VARCHAR(120),
  gym_name VARCHAR(160),
  plan_interest VARCHAR(20),
  selected_plan VARCHAR(20),
  utm_source VARCHAR(200),
  utm_medium VARCHAR(200),
  utm_campaign VARCHAR(200),
  utm_content VARCHAR(200),
  utm_term VARCHAR(200),
  referrer VARCHAR(500),
  landing_url VARCHAR(500),
  source VARCHAR(40) NOT NULL DEFAULT 'demo',
  consent_contact BOOLEAN NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  consent_text_version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  status_changed_at TIMESTAMPTZ,
  demo_completed_at TIMESTAMPTZ,
  wants_to_start_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_demo_lead_email UNIQUE (email),
  CONSTRAINT chk_demo_lead_status CHECK (
    status IN ('new', 'demo_viewed', 'contacted', 'wants_to_start', 'customer')
  ),
  CONSTRAINT chk_demo_lead_plan_interest CHECK (
    plan_interest IS NULL OR plan_interest IN ('personal', 'center')
  ),
  CONSTRAINT chk_demo_lead_selected_plan CHECK (
    selected_plan IS NULL OR selected_plan IN ('personal', 'center')
  )
);

CREATE INDEX IF NOT EXISTS idx_demo_lead_status_created
ON demo_lead (status, created_at);

CREATE TABLE IF NOT EXISTS demo_lead_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES demo_lead(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  step VARCHAR(40),
  event_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_demo_lead_event_event_id UNIQUE (event_id),
  CONSTRAINT chk_demo_lead_event_type CHECK (
    event_type IN ('lead_captured', 'demo_step_viewed', 'demo_completed', 'start_clicked')
  )
);

CREATE INDEX IF NOT EXISTS idx_demo_lead_event_lead_created
ON demo_lead_event (lead_id, created_at);

CREATE TABLE IF NOT EXISTS demo_lead_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_lead_attempt_ip_created
ON demo_lead_attempt (ip_hash, created_at);
