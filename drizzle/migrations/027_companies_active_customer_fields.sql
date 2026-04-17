-- companies: active assignment + customer flag (app wiring can follow later).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS active_team_id uuid;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS active_manager_id uuid;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS active_time integer NOT NULL DEFAULT 0;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.active_team_id IS 'Currently selected team for this company (nullable).';
COMMENT ON COLUMN companies.active_manager_id IS 'Currently selected manager user for this company (nullable).';
COMMENT ON COLUMN companies.active_time IS 'Numeric time field for active state; default 0 until product defines semantics.';
COMMENT ON COLUMN companies.is_customer IS '1 when this company is a customer; default false because not every company row represents a customer.';

DO $$
BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT companies_active_team_id_fkey
    FOREIGN KEY (active_team_id) REFERENCES teams(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT companies_active_manager_id_fkey
    FOREIGN KEY (active_manager_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
