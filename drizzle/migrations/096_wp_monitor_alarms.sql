-- WordPress monitoring, part 2: uptime checks made by this server, alarms (one open alarm per site and kind), snoozing and replay protection.
-- Safe to run as postgres or as dtlabs, and safe to run again: the new table is handed to dtlabs at the end.

ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS uptime_ok boolean;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS uptime_status integer;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS uptime_ms integer;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS uptime_checked_at timestamptz;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS uptime_fail_count integer NOT NULL DEFAULT 0;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS uptime_down_since timestamptz;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS last_signature varchar(64);

CREATE TABLE IF NOT EXISTS wp_site_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES wp_sites(id) ON DELETE CASCADE,
  code varchar(40) NOT NULL,
  level varchar(10) NOT NULL,
  message text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  notified_at timestamptz
);

-- A site has at most one open alarm of each kind, so an open alarm is never repeated.
CREATE UNIQUE INDEX IF NOT EXISTS wp_site_alarms_open_idx ON wp_site_alarms (site_id, code) WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS wp_site_alarms_site_idx ON wp_site_alarms (site_id, opened_at);

-- The app connects as dtlabs, so it must own the tables it writes to.
ALTER TABLE wp_site_alarms OWNER TO dtlabs;
