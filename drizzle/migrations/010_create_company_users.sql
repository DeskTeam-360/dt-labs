-- Junction: portal users ↔ companies (plus company_role). Some DBs only ran Drizzle SQL and never got Supabase create_company_check_tables.
CREATE TABLE IF NOT EXISTS company_users (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_role VARCHAR(32) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_users_company_id ON company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON company_users(user_id);

-- Table may exist from older SQL without company_role
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS company_role VARCHAR(32) NOT NULL DEFAULT 'member';

COMMENT ON COLUMN company_users.company_role IS 'member | company_admin';
