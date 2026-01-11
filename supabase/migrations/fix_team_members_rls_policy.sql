-- Fix infinite recursion in teams, team_members and todo_assignees RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can read teams they created or are members of" ON teams;
DROP POLICY IF EXISTS "Users can read team members of their teams" ON team_members;
DROP POLICY IF EXISTS "Users can read accessible todos" ON todos;
DROP POLICY IF EXISTS "Users can read assignees of accessible todos" ON todo_assignees;

-- Create helper function to check team membership (bypasses RLS for checking)
CREATE OR REPLACE FUNCTION public.is_team_member(team_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM team_members 
    WHERE team_members.team_id = team_id_param 
    AND team_members.user_id = user_id_param
  );
END;
$$;

-- Create helper function to check if user is assigned to a todo (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_todo_assignee(todo_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM todo_assignees 
    WHERE todo_assignees.todo_id = todo_id_param 
    AND todo_assignees.user_id = user_id_param
  );
END;
$$;

-- Fix teams policy to use helper function to avoid recursion
CREATE POLICY "Users can read teams they created or are members of"
  ON teams FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR  -- User created the team
    public.is_team_member(id, auth.uid())  -- User is a member of the team (using function to avoid recursion)
  );

-- Create new policy for team_members using the helper function to avoid recursion
CREATE POLICY "Users can read team members of their teams"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR  -- User can see their own membership
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid()) OR  -- Team creator can see all members
    public.is_team_member(team_id, auth.uid())  -- User is a member of the team (using function to avoid recursion)
  );

-- Fix todos policy to use helper functions to avoid recursion
CREATE POLICY "Users can read accessible todos"
  ON todos FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_todo_assignee(id, auth.uid()) OR
    (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())) OR
    (visibility = 'private' AND created_by = auth.uid())
  );

-- Fix todo_assignees policy to use helper functions to avoid recursion
CREATE POLICY "Users can read assignees of accessible todos"
  ON todo_assignees FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM todos WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );
