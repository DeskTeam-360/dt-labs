-- Add visibility 'public': all authenticated users can see the ticket

-- Tickets: allow read when visibility = 'public'
DROP POLICY IF EXISTS "Users can read accessible tickets" ON tickets;
CREATE POLICY "Users can read accessible tickets"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    (visibility = 'public') OR
    created_by = auth.uid() OR
    public.is_todo_assignee(id, auth.uid()) OR
    (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())) OR
    (visibility = 'private' AND created_by = auth.uid())
  );

-- Allow update when public (creator or assignee can update)
DROP POLICY IF EXISTS "Users can update accessible tickets" ON tickets;
CREATE POLICY "Users can update accessible tickets"
  ON tickets FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_todo_assignee(id, auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid() OR
    public.is_todo_assignee(id, auth.uid())
  );

-- todo_assignees: allow read for public tickets
DROP POLICY IF EXISTS "Users can read assignees of accessible tickets" ON todo_assignees;
CREATE POLICY "Users can read assignees of accessible tickets"
  ON todo_assignees FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- todo_checklist
DROP POLICY IF EXISTS "Users can read checklist items of accessible tickets" ON todo_checklist;
CREATE POLICY "Users can read checklist items of accessible tickets"
  ON todo_checklist FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Checklist/comment write: only creator or assignees (not all for public)
DROP POLICY IF EXISTS "Users can insert checklist items for accessible tickets" ON todo_checklist;
CREATE POLICY "Users can insert checklist items for accessible tickets"
  ON todo_checklist FOR INSERT
  TO authenticated
  WITH CHECK (
    todo_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update checklist items for accessible tickets" ON todo_checklist;
CREATE POLICY "Users can update checklist items for accessible tickets"
  ON todo_checklist FOR UPDATE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can delete checklist items for accessible tickets" ON todo_checklist;
CREATE POLICY "Users can delete checklist items for accessible tickets"
  ON todo_checklist FOR DELETE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- todo_comments: read = include public
DROP POLICY IF EXISTS "Users can read comments of accessible tickets" ON todo_comments;
CREATE POLICY "Users can read comments of accessible tickets"
  ON todo_comments FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Comment insert: creator or assignees only (user_id = auth.uid)
DROP POLICY IF EXISTS "Users can insert comments for accessible tickets" ON todo_comments;
CREATE POLICY "Users can insert comments for accessible tickets"
  ON todo_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    todo_id IN (
      SELECT id FROM tickets WHERE
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- todo_attributs: read includes public
DROP POLICY IF EXISTS "Users can read attributes of accessible tickets" ON todo_attributs;
CREATE POLICY "Users can read attributes of accessible tickets"
  ON todo_attributs FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- todo_time_tracker: read includes public
DROP POLICY IF EXISTS "Users can read time tracker records of accessible tickets" ON todo_time_tracker;
CREATE POLICY "Users can read time tracker records of accessible tickets"
  ON todo_time_tracker FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- ticket_tags: read includes public
DROP POLICY IF EXISTS "Users can read ticket_tags for accessible tickets" ON ticket_tags;
CREATE POLICY "Users can read ticket_tags for accessible tickets"
  ON ticket_tags FOR SELECT
  TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- ticket_attachments: read includes public
DROP POLICY IF EXISTS "Users can read ticket attachments of accessible tickets" ON ticket_attachments;
CREATE POLICY "Users can read ticket attachments of accessible tickets"
  ON ticket_attachments FOR SELECT
  TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE
        (visibility = 'public') OR
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- comment_attachments: read includes public (via todo_comments -> tickets)
DROP POLICY IF EXISTS "Users can read comment attachments of accessible comments" ON comment_attachments;
CREATE POLICY "Users can read comment attachments of accessible comments"
  ON comment_attachments FOR SELECT
  TO authenticated
  USING (
    comment_id IN (
      SELECT id FROM todo_comments WHERE
        todo_id IN (
          SELECT id FROM tickets WHERE
            (visibility = 'public') OR
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid()) OR
            (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
        )
    )
  );
