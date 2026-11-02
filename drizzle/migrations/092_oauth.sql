-- OAuth for MCP clients such as ChatGPT: registered clients, short-lived authorization codes, and one grant per connection.
-- A grant owns one api_keys row: the OAuth access token is that key, so access, limit and usage log work as for any key.
-- Safe to run as postgres or as dtlabs, and safe to run again: the new tables are handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash varchar(64) PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  redirect_uri text NOT NULL,
  code_challenge varchar(128) NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id uuid NOT NULL UNIQUE REFERENCES api_keys(id) ON DELETE CASCADE,
  refresh_hash varchar(64) NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_grants_refresh_idx ON oauth_grants (refresh_hash);

-- The app connects as dtlabs, so it must own the tables it writes to.
ALTER TABLE oauth_clients OWNER TO dtlabs;
ALTER TABLE oauth_codes OWNER TO dtlabs;
ALTER TABLE oauth_grants OWNER TO dtlabs;
