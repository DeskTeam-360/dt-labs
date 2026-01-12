-- Create todo_checklist table
CREATE TABLE IF NOT EXISTS todo_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create todo_comments table
CREATE TABLE IF NOT EXISTS todo_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create todo_attributs table (note: keeping original name from db_note)
CREATE TABLE IF NOT EXISTS todo_attributs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  meta_key VARCHAR(255) NOT NULL,
  meta_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(todo_id, meta_key)
);

-- Indexes for todo_checklist
CREATE INDEX IF NOT EXISTS idx_todo_checklist_todo_id ON todo_checklist(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_checklist_order_index ON todo_checklist(todo_id, order_index);

-- Indexes for todo_comments
CREATE INDEX IF NOT EXISTS idx_todo_comments_todo_id ON todo_comments(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_comments_user_id ON todo_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_comments_created_at ON todo_comments(created_at);

-- Indexes for todo_attributs
CREATE INDEX IF NOT EXISTS idx_todo_attributs_todo_id ON todo_attributs(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_attributs_meta_key ON todo_attributs(todo_id, meta_key);

-- Enable RLS
ALTER TABLE todo_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_attributs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for todo_checklist
-- Users can read checklist items for todos they can access
CREATE POLICY "Users can read checklist items of accessible todos"
  ON todo_checklist FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can insert checklist items for todos they can access
CREATE POLICY "Users can insert checklist items for accessible todos"
  ON todo_checklist FOR INSERT
  TO authenticated
  WITH CHECK (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can update checklist items for todos they can access
CREATE POLICY "Users can update checklist items for accessible todos"
  ON todo_checklist FOR UPDATE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can delete checklist items for todos they can access
CREATE POLICY "Users can delete checklist items for accessible todos"
  ON todo_checklist FOR DELETE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- RLS Policies for todo_comments
-- Users can read comments for todos they can access
CREATE POLICY "Users can read comments of accessible todos"
  ON todo_comments FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can insert comments for todos they can access
CREATE POLICY "Users can insert comments for accessible todos"
  ON todo_comments FOR INSERT
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

-- Users can update their own comments
CREATE POLICY "Users can update their own comments"
  ON todo_comments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON todo_comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for todo_attributs
-- Users can read attributes for todos they can access
CREATE POLICY "Users can read attributes of accessible todos"
  ON todo_attributs FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can insert attributes for todos they can access
CREATE POLICY "Users can insert attributes for accessible todos"
  ON todo_attributs FOR INSERT
  TO authenticated
  WITH CHECK (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can update attributes for todos they can access
CREATE POLICY "Users can update attributes for accessible todos"
  ON todo_attributs FOR UPDATE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Users can delete attributes for todos they can access
CREATE POLICY "Users can delete attributes for accessible todos"
  ON todo_attributs FOR DELETE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );
