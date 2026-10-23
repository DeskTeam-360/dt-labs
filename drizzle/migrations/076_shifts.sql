-- Work shifts: a catalog the admin maintains, and the shift each person is on right now.
-- All times are WIB (Asia/Jakarta). A shift whose end is earlier than its start crosses midnight (e.g. 23:00-07:00).
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(100) NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shifts_title_key UNIQUE (title)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_shift_id_idx ON users (shift_id);

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE shifts OWNER TO dtlabs;
