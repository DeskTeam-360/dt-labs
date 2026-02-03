-- Migration: Rename todos table to tickets and change id from UUID to SERIAL
-- This migration handles:
-- 1. Renaming todos to tickets
-- 2. Changing id from UUID to SERIAL (auto-increment integer)
-- 3. Updating all foreign key references

BEGIN;

-- Step 1: Create a mapping table to convert UUID to integer
CREATE TEMP TABLE todo_id_mapping AS
SELECT 
  id AS old_uuid,
  ROW_NUMBER() OVER (ORDER BY created_at) AS new_id
FROM todos
ORDER BY created_at;

-- Step 2: Drop all RLS policies that depend on columns we're about to change
-- This must be done before dropping columns to avoid dependency errors
-- We drop all policies that might reference todo_id columns

-- Drop all policies on todos table (using CASCADE to handle dependencies)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'todos' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON todos CASCADE', r.policyname);
    END LOOP;
END $$;

-- Drop all policies on todo_assignees table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'todo_assignees' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON todo_assignees CASCADE', r.policyname);
    END LOOP;
END $$;

-- Drop all policies on todo_checklist table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'todo_checklist' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON todo_checklist CASCADE', r.policyname);
    END LOOP;
END $$;

-- Drop all policies on todo_comments table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'todo_comments' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON todo_comments CASCADE', r.policyname);
    END LOOP;
END $$;

-- Drop all policies on todo_attributs table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'todo_attributs' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON todo_attributs CASCADE', r.policyname);
    END LOOP;
END $$;

-- Drop all policies on todo_time_tracker table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'todo_time_tracker' AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON todo_time_tracker CASCADE', r.policyname);
    END LOOP;
END $$;

-- Also drop policies explicitly by name (in case the above doesn't catch them all)
-- Drop policies on todos table
DROP POLICY IF EXISTS "Users can read accessible todos" ON todos;
DROP POLICY IF EXISTS "Users can create todos" ON todos;
DROP POLICY IF EXISTS "Users can update accessible todos" ON todos;
DROP POLICY IF EXISTS "Users can delete todos they created" ON todos;

-- Drop policies on todo_assignees table
DROP POLICY IF EXISTS "Users can read assignees of accessible todos" ON todo_assignees;
DROP POLICY IF EXISTS "Users can add assignees to their todos" ON todo_assignees;
DROP POLICY IF EXISTS "Users can remove assignees from their todos" ON todo_assignees;

-- Drop policies on todo_checklist table
DROP POLICY IF EXISTS "Users can read checklist items of accessible todos" ON todo_checklist;
DROP POLICY IF EXISTS "Users can insert checklist items for accessible todos" ON todo_checklist;
DROP POLICY IF EXISTS "Users can update checklist items for accessible todos" ON todo_checklist;
DROP POLICY IF EXISTS "Users can delete checklist items for accessible todos" ON todo_checklist;

-- Drop policies on todo_comments table
DROP POLICY IF EXISTS "Users can read comments of accessible todos" ON todo_comments;
DROP POLICY IF EXISTS "Users can insert comments for accessible todos" ON todo_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON todo_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON todo_comments;

-- Drop policies on todo_attributs table
DROP POLICY IF EXISTS "Users can read attributes of accessible todos" ON todo_attributs;
DROP POLICY IF EXISTS "Users can insert attributes for accessible todos" ON todo_attributs;
DROP POLICY IF EXISTS "Users can update attributes for accessible todos" ON todo_attributs;
DROP POLICY IF EXISTS "Users can delete attributes for accessible todos" ON todo_attributs;

-- Drop policies on todo_time_tracker table
DROP POLICY IF EXISTS "Users can read time tracker records of accessible todos" ON todo_time_tracker;
DROP POLICY IF EXISTS "Users can insert time tracker records for accessible todos" ON todo_time_tracker;
DROP POLICY IF EXISTS "Users can update their own time tracker records" ON todo_time_tracker;

-- Step 3: Drop all foreign key constraints that reference todos
ALTER TABLE todo_assignees DROP CONSTRAINT IF EXISTS todo_assignees_todo_id_fkey;
ALTER TABLE todo_checklist DROP CONSTRAINT IF EXISTS todo_checklist_todo_id_fkey;
ALTER TABLE todo_comments DROP CONSTRAINT IF EXISTS todo_comments_todo_id_fkey;
ALTER TABLE todo_attributs DROP CONSTRAINT IF EXISTS todo_attributs_todo_id_fkey;
ALTER TABLE todo_time_tracker DROP CONSTRAINT IF EXISTS todo_time_tracker_todo_id_fkey;
ALTER TABLE screenshots DROP CONSTRAINT IF EXISTS screenshots_todo_id_fkey;

-- Step 4: Add temporary integer column to todos table
ALTER TABLE todos ADD COLUMN temp_id INTEGER;

-- Step 5: Populate the temporary integer column using the mapping
UPDATE todos t
SET temp_id = m.new_id
FROM todo_id_mapping m
WHERE t.id = m.old_uuid;

-- Step 6: Update all related tables' todo_id columns to integer
-- First, add temporary integer columns
ALTER TABLE todo_assignees ADD COLUMN temp_todo_id INTEGER;
ALTER TABLE todo_checklist ADD COLUMN temp_todo_id INTEGER;
ALTER TABLE todo_comments ADD COLUMN temp_todo_id INTEGER;
ALTER TABLE todo_attributs ADD COLUMN temp_todo_id INTEGER;
ALTER TABLE todo_time_tracker ADD COLUMN temp_todo_id INTEGER;
ALTER TABLE screenshots ADD COLUMN temp_todo_id INTEGER;

-- Populate the temporary columns
UPDATE todo_assignees ta
SET temp_todo_id = m.new_id
FROM todo_id_mapping m
WHERE ta.todo_id = m.old_uuid;

UPDATE todo_checklist tc
SET temp_todo_id = m.new_id
FROM todo_id_mapping m
WHERE tc.todo_id = m.old_uuid;

UPDATE todo_comments tco
SET temp_todo_id = m.new_id
FROM todo_id_mapping m
WHERE tco.todo_id = m.old_uuid;

UPDATE todo_attributs ta
SET temp_todo_id = m.new_id
FROM todo_id_mapping m
WHERE ta.todo_id = m.old_uuid;

UPDATE todo_time_tracker ttt
SET temp_todo_id = m.new_id
FROM todo_id_mapping m
WHERE ttt.todo_id = m.old_uuid;

UPDATE screenshots s
SET temp_todo_id = m.new_id
FROM todo_id_mapping m
WHERE s.todo_id = m.old_uuid;

-- Step 6: Drop old UUID columns and rename temp columns
ALTER TABLE todo_assignees DROP COLUMN todo_id;
ALTER TABLE todo_assignees RENAME COLUMN temp_todo_id TO todo_id;

ALTER TABLE todo_checklist DROP COLUMN todo_id;
ALTER TABLE todo_checklist RENAME COLUMN temp_todo_id TO todo_id;

ALTER TABLE todo_comments DROP COLUMN todo_id;
ALTER TABLE todo_comments RENAME COLUMN temp_todo_id TO todo_id;

ALTER TABLE todo_attributs DROP COLUMN todo_id;
ALTER TABLE todo_attributs RENAME COLUMN temp_todo_id TO todo_id;

ALTER TABLE todo_time_tracker DROP COLUMN todo_id;
ALTER TABLE todo_time_tracker RENAME COLUMN temp_todo_id TO todo_id;

ALTER TABLE screenshots DROP COLUMN todo_id;
ALTER TABLE screenshots RENAME COLUMN temp_todo_id TO todo_id;

-- Step 8: Create sequence for tickets id
CREATE SEQUENCE IF NOT EXISTS tickets_id_seq;

-- Set the sequence to start from the max value (or 1 if no data exists)
-- If no data: set to 0 with is_called=false, so nextval returns 1
-- If data exists: set to max with is_called=true, so nextval returns max+1
DO $$
DECLARE
  max_id INTEGER;
BEGIN
  SELECT MAX(temp_id) INTO max_id FROM todos;
  IF max_id IS NULL THEN
    -- No data, start sequence at 1
    PERFORM setval('tickets_id_seq', 1, false);
  ELSE
    -- Data exists, set to max so next value is max+1
    PERFORM setval('tickets_id_seq', max_id, true);
  END IF;
END $$;

-- Step 9: Drop the old UUID id column and rename temp_id to id with SERIAL
ALTER TABLE todos DROP CONSTRAINT todos_pkey;
ALTER TABLE todos DROP COLUMN id;
ALTER TABLE todos RENAME COLUMN temp_id TO id;
ALTER TABLE todos ALTER COLUMN id SET DEFAULT nextval('tickets_id_seq');
ALTER TABLE todos ADD PRIMARY KEY (id);
ALTER SEQUENCE tickets_id_seq OWNED BY todos.id;

-- Step 10: Rename table from todos to tickets
ALTER TABLE todos RENAME TO tickets;

-- Update sequence ownership after table rename
ALTER SEQUENCE tickets_id_seq OWNED BY tickets.id;

-- Step 10: Set NOT NULL constraints on todo_id columns (except screenshots which allows NULL)
ALTER TABLE todo_assignees ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_checklist ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_comments ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_attributs ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_time_tracker ALTER COLUMN todo_id SET NOT NULL;
-- screenshots.todo_id can be NULL, so we don't set NOT NULL

-- Step 11: Set NOT NULL constraints on todo_id columns (except screenshots which allows NULL)
ALTER TABLE todo_assignees ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_checklist ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_comments ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_attributs ALTER COLUMN todo_id SET NOT NULL;
ALTER TABLE todo_time_tracker ALTER COLUMN todo_id SET NOT NULL;
-- screenshots.todo_id can be NULL, so we don't set NOT NULL

-- Step 12: Recreate all foreign key constraints
ALTER TABLE todo_assignees 
  ADD CONSTRAINT todo_assignees_todo_id_fkey 
  FOREIGN KEY (todo_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE todo_checklist 
  ADD CONSTRAINT todo_checklist_todo_id_fkey 
  FOREIGN KEY (todo_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE todo_comments 
  ADD CONSTRAINT todo_comments_todo_id_fkey 
  FOREIGN KEY (todo_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE todo_attributs 
  ADD CONSTRAINT todo_attributs_todo_id_fkey 
  FOREIGN KEY (todo_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE todo_time_tracker 
  ADD CONSTRAINT todo_time_tracker_todo_id_fkey 
  FOREIGN KEY (todo_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE screenshots 
  ADD CONSTRAINT screenshots_todo_id_fkey 
  FOREIGN KEY (todo_id) REFERENCES tickets(id) ON DELETE SET NULL;

-- Step 13: Update indexes (they should still work, but let's recreate them to be safe)
DROP INDEX IF EXISTS idx_todo_assignees_todo_id;
CREATE INDEX idx_todo_assignees_todo_id ON todo_assignees(todo_id);

DROP INDEX IF EXISTS idx_todo_checklist_todo_id;
CREATE INDEX idx_todo_checklist_todo_id ON todo_checklist(todo_id);

DROP INDEX IF EXISTS idx_todo_checklist_order_index;
CREATE INDEX idx_todo_checklist_order_index ON todo_checklist(todo_id, order_index);

DROP INDEX IF EXISTS idx_todo_comments_todo_id;
CREATE INDEX idx_todo_comments_todo_id ON todo_comments(todo_id);

DROP INDEX IF EXISTS idx_todo_attributs_todo_id;
CREATE INDEX idx_todo_attributs_todo_id ON todo_attributs(todo_id);

DROP INDEX IF EXISTS idx_todo_time_tracker_todo_id;
CREATE INDEX idx_todo_time_tracker_todo_id ON todo_time_tracker(todo_id);

DROP INDEX IF EXISTS idx_screenshots_todo_id;
CREATE INDEX idx_screenshots_todo_id ON screenshots(todo_id);

-- Update todos table indexes (now tickets)
DROP INDEX IF EXISTS idx_todos_created_by;
CREATE INDEX idx_tickets_created_by ON tickets(created_by);

DROP INDEX IF EXISTS idx_todos_team_id;
CREATE INDEX idx_tickets_team_id ON tickets(team_id);

DROP INDEX IF EXISTS idx_todos_status;
CREATE INDEX idx_tickets_status ON tickets(status);

DROP INDEX IF EXISTS idx_todos_visibility;
CREATE INDEX idx_tickets_visibility ON tickets(visibility);

DROP INDEX IF EXISTS idx_todos_due_date;
CREATE INDEX idx_tickets_due_date ON tickets(due_date);

DROP INDEX IF EXISTS idx_todos_created_at;
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

-- Step 14: Update trigger name
DROP TRIGGER IF EXISTS update_todos_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at 
BEFORE UPDATE ON tickets
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Step 15: Update helper function is_todo_assignee to use INTEGER
CREATE OR REPLACE FUNCTION public.is_todo_assignee(ticket_id_param INTEGER, user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM todo_assignees 
    WHERE todo_assignees.todo_id = ticket_id_param 
    AND todo_assignees.user_id = user_id_param
  );
END;
$$;

-- Step 16: Recreate RLS policies with updated table name and column types
-- (Old policies were already dropped in Step 2, so we just create new ones)

-- Recreate policies for tickets table
CREATE POLICY "Users can read accessible tickets"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_todo_assignee(id, auth.uid()) OR
    (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())) OR
    (visibility = 'private' AND created_by = auth.uid())
  );

CREATE POLICY "Users can create tickets"
  ON tickets FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

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

CREATE POLICY "Users can delete tickets they created"
  ON tickets FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Update todo_assignees policies
DROP POLICY IF EXISTS "Users can read assignees of accessible todos" ON todo_assignees;
DROP POLICY IF EXISTS "Users can add assignees to their todos" ON todo_assignees;
DROP POLICY IF EXISTS "Users can remove assignees from their todos" ON todo_assignees;

CREATE POLICY "Users can read assignees of accessible tickets"
  ON todo_assignees FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can add assignees to their tickets"
  ON todo_assignees FOR INSERT
  TO authenticated
  WITH CHECK (
    todo_id IN (SELECT id FROM tickets WHERE created_by = auth.uid())
  );

CREATE POLICY "Users can remove assignees from their tickets"
  ON todo_assignees FOR DELETE
  TO authenticated
  USING (
    todo_id IN (SELECT id FROM tickets WHERE created_by = auth.uid())
  );

-- Update todo_checklist policies
DROP POLICY IF EXISTS "Users can read checklist items of accessible todos" ON todo_checklist;
DROP POLICY IF EXISTS "Users can insert checklist items for accessible todos" ON todo_checklist;
DROP POLICY IF EXISTS "Users can update checklist items for accessible todos" ON todo_checklist;
DROP POLICY IF EXISTS "Users can delete checklist items for accessible todos" ON todo_checklist;

CREATE POLICY "Users can read checklist items of accessible tickets"
  ON todo_checklist FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

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

-- Update todo_comments policies
DROP POLICY IF EXISTS "Users can read comments of accessible todos" ON todo_comments;
DROP POLICY IF EXISTS "Users can insert comments for accessible todos" ON todo_comments;

CREATE POLICY "Users can read comments of accessible tickets"
  ON todo_comments FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

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

-- Update todo_attributs policies
DROP POLICY IF EXISTS "Users can read attributes of accessible todos" ON todo_attributs;
DROP POLICY IF EXISTS "Users can insert attributes for accessible todos" ON todo_attributs;
DROP POLICY IF EXISTS "Users can update attributes for accessible todos" ON todo_attributs;
DROP POLICY IF EXISTS "Users can delete attributes for accessible todos" ON todo_attributs;

CREATE POLICY "Users can read attributes of accessible tickets"
  ON todo_attributs FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can insert attributes for accessible tickets"
  ON todo_attributs FOR INSERT
  TO authenticated
  WITH CHECK (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can update attributes for accessible tickets"
  ON todo_attributs FOR UPDATE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can delete attributes for accessible tickets"
  ON todo_attributs FOR DELETE
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

-- Update todo_time_tracker policies
DROP POLICY IF EXISTS "Users can read time tracker records of accessible todos" ON todo_time_tracker;
DROP POLICY IF EXISTS "Users can insert time tracker records for accessible todos" ON todo_time_tracker;

CREATE POLICY "Users can read time tracker records of accessible tickets"
  ON todo_time_tracker FOR SELECT
  TO authenticated
  USING (
    todo_id IN (
      SELECT id FROM tickets WHERE 
        created_by = auth.uid() OR
        public.is_todo_assignee(id, auth.uid()) OR
        (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
    )
  );

CREATE POLICY "Users can insert time tracker records for accessible tickets"
  ON todo_time_tracker FOR INSERT
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

COMMIT;
