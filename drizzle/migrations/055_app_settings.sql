CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(64)  PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO app_settings (key, value) VALUES
  ('app_name',      'DeskTeam360'),
  ('app_logo_url',  NULL),
  ('app_favicon_url', NULL)
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON app_settings TO dtlabs;
