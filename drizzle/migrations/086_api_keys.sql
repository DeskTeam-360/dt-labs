-- API keys that Team Leaders, Operations and Admins create themselves, each with the access it is allowed to use (scopes).
-- Only a hash of the key is stored; the key itself is shown once when it is created.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  key_prefix varchar(16) NOT NULL,
  key_hash varchar(64) NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE api_keys OWNER TO dtlabs;
