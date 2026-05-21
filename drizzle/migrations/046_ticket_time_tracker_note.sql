ALTER TABLE ticket_time_tracker
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN ticket_time_tracker.note IS 'Optional note on a time entry; nullable, set via edit.';
