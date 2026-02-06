-- Allow users to update their own time tracker records (e.g. stop timer)
-- This policy was dropped in rename_todos_to_tickets but never recreated.

CREATE POLICY "Users can update their own time tracker records"
  ON todo_time_tracker FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fix duration trigger: cap duration_seconds at INTEGER max so sessions >1 day (or very long) don't overflow
CREATE OR REPLACE FUNCTION calculate_duration_seconds()
RETURNS TRIGGER AS $$
DECLARE
  secs BIGINT;
BEGIN
  IF NEW.stop_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    secs := FLOOR(EXTRACT(EPOCH FROM (NEW.stop_time - NEW.start_time)))::BIGINT;
    NEW.duration_seconds := LEAST(secs, 2147483647)::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
