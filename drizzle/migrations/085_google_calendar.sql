-- Pushing calendar entries to a person's own Google Calendar (Admin and Operations).
-- google_calendar_connections: the Google account each person connected (one per person).
-- calendar_google_links: which Google event an entry became in whose calendar, so edits and deletes can follow.
-- Safe to run as postgres or as dtlabs: the new tables are handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email varchar(255),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  calendar_id varchar(255) NOT NULL DEFAULT 'primary',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_google_links (
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- The app connects as dtlabs, so it must own the tables it writes to.
ALTER TABLE google_calendar_connections OWNER TO dtlabs;
ALTER TABLE calendar_google_links OWNER TO dtlabs;
