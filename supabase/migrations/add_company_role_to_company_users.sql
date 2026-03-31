ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS company_role VARCHAR(32) NOT NULL DEFAULT 'member';

COMMENT ON COLUMN company_users.company_role IS 'member | company_admin';
