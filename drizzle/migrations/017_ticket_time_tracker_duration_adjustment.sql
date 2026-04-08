ALTER TABLE ticket_time_tracker
  ADD COLUMN IF NOT EXISTS duration_adjustment integer;

UPDATE ticket_time_tracker
SET duration_adjustment = duration_seconds
WHERE duration_seconds IS NOT NULL AND duration_adjustment IS NULL;
