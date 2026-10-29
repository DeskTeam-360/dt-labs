-- A log of every call made with an API key (who, which endpoint, when), including refused calls with the reason.
-- Rows older than 90 days are cleared when a key's usage is viewed.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS api_key_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  method varchar(8) NOT NULL,
  path varchar(200) NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  denied_reason varchar(40),
  ip varchar(64),
  user_agent varchar(200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_key_usage_key_idx ON api_key_usage (key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_key_usage_created_idx ON api_key_usage (created_at);

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE api_key_usage OWNER TO dtlabs;
