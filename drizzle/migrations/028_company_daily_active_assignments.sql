-- Daily snapshot of companies.active_team_id, active_manager_id, active_time (filled by cron API).
CREATE TABLE IF NOT EXISTS company_daily_active_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  active_team_id uuid,
  active_manager_id uuid,
  active_time integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_daily_active_assignments_company_id_snapshot_date_key UNIQUE (company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS company_daily_active_assignments_snapshot_date_idx
  ON company_daily_active_assignments (snapshot_date);

COMMENT ON TABLE company_daily_active_assignments IS 'Company Log: cron copies companies.active_* per UTC day; staff may add/edit via API.';
