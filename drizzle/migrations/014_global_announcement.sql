-- Global announcement (singleton row): running text banner with optional schedule.
CREATE TABLE IF NOT EXISTS global_announcement (
  id uuid PRIMARY KEY,
  message text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

INSERT INTO global_announcement (id, message, is_enabled)
VALUES ('a0000001-0000-4000-8000-000000000001', '', false)
ON CONFLICT (id) DO NOTHING;
