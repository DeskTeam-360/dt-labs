-- People in charge (PIC) of a customer company: several per company, one of them primary, the rest secondary.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS company_pics (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'secondary',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id),
  CONSTRAINT company_pics_role_check CHECK (role IN ('primary', 'secondary'))
);

-- At most one primary PIC per company.
CREATE UNIQUE INDEX IF NOT EXISTS company_pics_one_primary_idx ON company_pics (company_id) WHERE role = 'primary';

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE company_pics OWNER TO dtlabs;
