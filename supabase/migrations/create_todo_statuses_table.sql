-- Todo statuses: flexible status config (title, color, show in kanban or not)
CREATE TABLE IF NOT EXISTS todo_statuses (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  description text NOT NULL DEFAULT '',
  color VARCHAR(20) NOT NULL,
  show_in_kanban BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todo_statuses_show_in_kanban ON todo_statuses(show_in_kanban);
CREATE INDEX IF NOT EXISTS idx_todo_statuses_sort_order ON todo_statuses(sort_order);

-- Trigger for updated_at
CREATE TRIGGER update_todo_statuses_updated_at
  BEFORE UPDATE ON todo_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: all authenticated can read
ALTER TABLE todo_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read todo statuses"
  ON todo_statuses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert todo statuses"
  ON todo_statuses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update todo statuses"
  ON todo_statuses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete todo statuses"
  ON todo_statuses FOR DELETE
  TO authenticated
  USING (true);

-- Seed default statuses (first slug `open` matches app default for new tickets; then in_progress, completed; not shown: cancel, archived)
INSERT INTO todo_statuses (slug, title, color, show_in_kanban, sort_order) VALUES
  ('open', 'Open', '#faad14', true, 1),
  ('in_progress', 'In Progress', '#1890ff', true, 2),
  ('completed', 'Completed', '#52c41a', true, 3),
  ('cancel', 'Cancel', '#ff4d4f', false, 4),
  ('archived', 'Archived', '#8c8c8c', false, 5)
ON CONFLICT (slug) DO NOTHING;
