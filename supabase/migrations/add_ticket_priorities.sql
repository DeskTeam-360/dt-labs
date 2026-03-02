-- Ticket Priorities: id, title, slug, sort_order, color
CREATE TABLE IF NOT EXISTS ticket_priorities (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#000000',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_priorities_sort_order ON ticket_priorities(sort_order);

CREATE TRIGGER update_ticket_priorities_updated_at
  BEFORE UPDATE ON ticket_priorities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ticket_priorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ticket priorities"
  ON ticket_priorities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ticket priorities"
  ON ticket_priorities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ticket priorities"
  ON ticket_priorities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete ticket priorities"
  ON ticket_priorities FOR DELETE TO authenticated USING (true);

-- Add priority_id to tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS priority_id INTEGER REFERENCES ticket_priorities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_priority_id ON tickets(priority_id);

-- Seed default priorities: urgent, high, medium, low
INSERT INTO ticket_priorities (slug, title, color, sort_order) VALUES
  ('urgent', 'Urgent', '#ff4d4f', 1),
  ('high', 'High', '#fa8c16', 2),
  ('medium', 'Medium', '#1890ff', 3),
  ('low', 'Low', '#8c8c8c', 4)
ON CONFLICT (slug) DO NOTHING;
