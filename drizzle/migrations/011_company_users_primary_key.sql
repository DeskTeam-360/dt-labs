-- Legacy company_users tables may lack a composite PK; Drizzle ON CONFLICT needs it.
-- Skips if a primary key already exists. Fails if duplicate (company_id, user_id) rows exist (clean those first).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'company_users'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE company_users
      ADD CONSTRAINT company_users_pkey PRIMARY KEY (company_id, user_id);
  END IF;
END $$;
