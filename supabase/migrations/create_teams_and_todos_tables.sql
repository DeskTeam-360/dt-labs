-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- member or manager
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Create todos table
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, archived
  visibility VARCHAR(50) NOT NULL DEFAULT 'private', -- private, team, specific_users
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create todo_assignees table
CREATE TABLE IF NOT EXISTS todo_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(todo_id, user_id)
);

-- Indexes for teams table
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at);

-- Indexes for team_members table
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);

-- Indexes for todos table
CREATE INDEX IF NOT EXISTS idx_todos_created_by ON todos(created_by);
CREATE INDEX IF NOT EXISTS idx_todos_team_id ON todos(team_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_visibility ON todos(visibility);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);

-- Indexes for todo_assignees table
CREATE INDEX IF NOT EXISTS idx_todo_assignees_todo_id ON todo_assignees(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_assignees_user_id ON todo_assignees(user_id);

-- Trigger for auto update todos.updated_at
CREATE TRIGGER update_todos_updated_at 
BEFORE UPDATE ON todos
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_assignees ENABLE ROW LEVEL SECURITY;

-- RLS Policies for teams table
-- Users can read teams they are members of or created
CREATE POLICY "Users can read teams they created or are members of"
  ON teams FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- Users can create teams
CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Team creators can update their teams
CREATE POLICY "Team creators can update their teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Team creators can delete their teams
CREATE POLICY "Team creators can delete their teams"
  ON teams FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for team_members table
-- Users can read team members of teams they belong to
CREATE POLICY "Users can read team members of their teams"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()) OR
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

-- Team creators can add members
CREATE POLICY "Team creators can add members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

-- Team creators can update members
CREATE POLICY "Team creators can update members"
  ON team_members FOR UPDATE
  TO authenticated
  USING (
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  )
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

-- Team creators can remove members
CREATE POLICY "Team creators can remove members"
  ON team_members FOR DELETE
  TO authenticated
  USING (
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

-- RLS Policies for todos table
-- Users can read todos they created, are assigned to, or belong to their team
CREATE POLICY "Users can read accessible todos"
  ON todos FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    id IN (SELECT todo_id FROM todo_assignees WHERE user_id = auth.uid()) OR
    (visibility = 'team' AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())) OR
    (visibility = 'private' AND created_by = auth.uid())
  );

-- Users can create todos
CREATE POLICY "Users can create todos"
  ON todos FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Users can update todos they created or are assigned to
CREATE POLICY "Users can update accessible todos"
  ON todos FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    id IN (SELECT todo_id FROM todo_assignees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid() OR
    id IN (SELECT todo_id FROM todo_assignees WHERE user_id = auth.uid())
  );

-- Users can delete todos they created
CREATE POLICY "Users can delete todos they created"
  ON todos FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for todo_assignees table
-- Users can read assignees of todos they can access
CREATE POLICY "Users can read assignees of accessible todos"
  ON todo_assignees FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        id IN (SELECT todo_id FROM todo_assignees WHERE user_id = auth.uid()) OR
        (visibility = 'team' AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
    )
  );

-- Users can add assignees to todos they created
CREATE POLICY "Users can add assignees to their todos"
  ON todo_assignees FOR INSERT
  TO authenticated
  WITH CHECK (
    todo_id IN (SELECT id FROM todos WHERE created_by = auth.uid())
  );

-- Users can remove assignees from todos they created
CREATE POLICY "Users can remove assignees from their todos"
  ON todo_assignees FOR DELETE
  TO authenticated
  USING (
    todo_id IN (SELECT id FROM todos WHERE created_by = auth.uid())
  );
