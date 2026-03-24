-- tracker_type: timer (start/stop) | manual (logged duration)
ALTER TABLE ticket_time_tracker
  ADD COLUMN IF NOT EXISTS tracker_type varchar(32) NOT NULL DEFAULT 'timer';
