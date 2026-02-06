-- Ticket attachments (for ticket description): multiple files per ticket
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_created_at ON ticket_attachments(created_at);

ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read ticket attachments of accessible tickets"
  ON ticket_attachments FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can insert ticket attachments for accessible tickets"
  ON ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can delete ticket attachments of accessible tickets"
  ON ticket_attachments FOR DELETE TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Comment attachments: multiple files per comment
CREATE TABLE IF NOT EXISTS comment_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES todo_comments(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_attachments_comment_id ON comment_attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_attachments_created_at ON comment_attachments(created_at);

ALTER TABLE comment_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read comment attachments of accessible comments"
  ON comment_attachments FOR SELECT TO authenticated
  USING (
    comment_id IN (
      SELECT id FROM todo_comments WHERE
        todo_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid()) OR
            (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
        )
    )
  );

CREATE POLICY "Users can insert comment attachments for own comments"
  ON comment_attachments FOR INSERT TO authenticated
  WITH CHECK (
    comment_id IN (SELECT id FROM todo_comments WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete comment attachments of own comments"
  ON comment_attachments FOR DELETE TO authenticated
  USING (
    comment_id IN (SELECT id FROM todo_comments WHERE user_id = auth.uid())
  );
