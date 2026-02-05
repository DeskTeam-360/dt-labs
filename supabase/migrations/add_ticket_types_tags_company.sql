-- Ticket Types: 1 ticket 1 type, flexible CRUD
CREATE TABLE IF NOT EXISTS ticket_types (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#000000',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_sort_order ON ticket_types(sort_order);

CREATE TRIGGER update_ticket_types_updated_at
  BEFORE UPDATE ON ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ticket types"
  ON ticket_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ticket types"
  ON ticket_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ticket types"
  ON ticket_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete ticket types"
  ON ticket_types FOR DELETE TO authenticated USING (true);

-- Tags: global list, many-to-many with tickets
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#000000',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tags"
  ON tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tags"
  ON tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tags"
  ON tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete tags"
  ON tags FOR DELETE TO authenticated USING (true);

-- Junction: ticket_tags (1 ticket many tags)
CREATE TABLE IF NOT EXISTS ticket_tags (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (ticket_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket_id ON ticket_tags(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag_id ON ticket_tags(tag_id);

ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read ticket_tags for accessible tickets"
  ON ticket_tags FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );
CREATE POLICY "Users can insert ticket_tags for their tickets"
  ON ticket_tags FOR INSERT TO authenticated
  WITH CHECK (
    ticket_id IN (SELECT id FROM tickets WHERE created_by = auth.uid())
  );
CREATE POLICY "Users can delete ticket_tags for their tickets"
  ON ticket_tags FOR DELETE TO authenticated
  USING (
    ticket_id IN (SELECT id FROM tickets WHERE created_by = auth.uid())
  );

-- Add type_id and company_id to tickets (1 ticket 1 type, 1 ticket 1 company)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS type_id INTEGER REFERENCES ticket_types(id) ON DELETE SET NULL;
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_type_id ON tickets(type_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON tickets(company_id);
