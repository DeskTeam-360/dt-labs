-- Create todo_time_tracker table
CREATE TABLE IF NOT EXISTS todo_time_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  stop_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for todo_time_tracker
CREATE INDEX IF NOT EXISTS idx_todo_time_tracker_todo_id ON todo_time_tracker(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_time_tracker_user_id ON todo_time_tracker(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_time_tracker_start_time ON todo_time_tracker(start_time);
CREATE INDEX IF NOT EXISTS idx_todo_time_tracker_stop_time ON todo_time_tracker(stop_time);

-- Enable RLS
ALTER TABLE todo_time_tracker ENABLE ROW LEVEL SECURITY;

-- RLS Policies for todo_time_tracker
-- Users can read time tracker records for todos they can access
CREATE POLICY "Users can read time tracker records of accessible todos"
  ON todo_time_tracker FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can insert time tracker records for todos they can access
CREATE POLICY "Users can insert time tracker records for accessible todos"
  ON todo_time_tracker FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can update their own time tracker records
CREATE POLICY "Users can update their own time tracker records"
  ON todo_time_tracker FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Function to calculate duration_seconds automatically
CREATE OR REPLACE FUNCTION calculate_duration_seconds()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stop_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.stop_time - NEW.start_time))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate duration_seconds
CREATE TRIGGER calculate_duration_trigger
  BEFORE INSERT OR UPDATE ON todo_time_tracker
  FOR EACH ROW
  WHEN (NEW.stop_time IS NOT NULL)
  EXECUTE FUNCTION calculate_duration_seconds();
