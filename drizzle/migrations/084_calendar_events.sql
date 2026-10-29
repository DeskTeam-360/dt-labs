-- The team calendar's own entries: birthdays, holidays, leave (cuti), duty (piket) and other events.
-- A birthday or holiday can repeat every year. user_id says whose leave / duty / birthday it is.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(20) NOT NULL DEFAULT 'event',
  title varchar(200) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  repeat_yearly boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_type_check CHECK (type IN ('birthday', 'holiday', 'leave', 'duty', 'event')),
  CONSTRAINT calendar_events_range_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS calendar_events_range_idx ON calendar_events (start_date, end_date);
CREATE INDEX IF NOT EXISTS calendar_events_user_idx ON calendar_events (user_id);

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE calendar_events OWNER TO dtlabs;
