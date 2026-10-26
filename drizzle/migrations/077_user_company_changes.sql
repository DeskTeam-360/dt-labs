-- History of every change to a person's company, so a customer that "suddenly changed company" can be explained.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS user_company_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_company_id uuid,
  to_company_id uuid,
  -- Where the change came from: admin_edit, company_leader, email_sender, email_cc, portal_cc, freshdesk_import ...
  source varchar(40) NOT NULL,
  actor_user_id uuid,
  ticket_id integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_company_changes_user_idx ON user_company_changes (user_id, created_at DESC);

ALTER TABLE user_company_changes OWNER TO dtlabs;
