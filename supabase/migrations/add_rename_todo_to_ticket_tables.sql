-- Align table/column names with Drizzle schema: todo_* -> ticket_*
-- Run this if you get "Failed query: ... from ticket_checklist" (table doesn't exist)

-- 1. todo_checklist -> ticket_checklist, todo_id -> ticket_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_checklist')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_checklist')
  THEN
    -- Drop RLS policies (they reference todo_checklist)
    DROP POLICY IF EXISTS "Users can read checklist items of accessible tickets" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can insert checklist items for accessible tickets" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can update checklist items for accessible tickets" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can delete checklist items for accessible tickets" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can read checklist items of accessible todos" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can insert checklist items for accessible todos" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can update checklist items for accessible todos" ON todo_checklist;
    DROP POLICY IF EXISTS "Users can delete checklist items for accessible todos" ON todo_checklist;

    ALTER TABLE todo_checklist RENAME TO ticket_checklist;
    ALTER TABLE ticket_checklist RENAME COLUMN todo_id TO ticket_id;

    DROP INDEX IF EXISTS idx_todo_checklist_todo_id;
    DROP INDEX IF EXISTS idx_todo_checklist_order_index;
    CREATE INDEX IF NOT EXISTS idx_ticket_checklist_ticket_id ON ticket_checklist(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_checklist_order_index ON ticket_checklist(ticket_id, order_index);

    -- Recreate RLS policies
    ALTER TABLE ticket_checklist ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can read checklist items of accessible tickets"
      ON ticket_checklist FOR SELECT TO authenticated
      USING (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            (visibility = 'public') OR
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid()) OR
            (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
        )
      );
    CREATE POLICY "Users can insert checklist items for accessible tickets"
      ON ticket_checklist FOR INSERT TO authenticated
      WITH CHECK (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid()) OR
            (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
        )
      );
    CREATE POLICY "Users can update checklist items for accessible tickets"
      ON ticket_checklist FOR UPDATE TO authenticated
      USING (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid())
        )
      );
    CREATE POLICY "Users can delete checklist items for accessible tickets"
      ON ticket_checklist FOR DELETE TO authenticated
      USING (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid())
        )
      );
  END IF;
END $$;

-- 2. todo_attributs -> ticket_attributs, todo_id -> ticket_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_attributs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_attributs')
  THEN
    DROP POLICY IF EXISTS "Users can read attributs of accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can read attributes of accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can insert attributs for accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can insert attributes for accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can update attributs for accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can update attributes for accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can delete attributs for accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can delete attributes for accessible tickets" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can read attributs of accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can read attributes of accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can insert attributs for accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can insert attributes for accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can update attributs for accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can update attributes for accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can delete attributs for accessible todos" ON todo_attributs;
    DROP POLICY IF EXISTS "Users can delete attributes for accessible todos" ON todo_attributs;

    ALTER TABLE todo_attributs RENAME TO ticket_attributs;
    ALTER TABLE ticket_attributs RENAME COLUMN todo_id TO ticket_id;

    DROP INDEX IF EXISTS idx_todo_attributs_todo_id;
    DROP INDEX IF EXISTS idx_todo_attributs_meta_key;
    CREATE INDEX IF NOT EXISTS idx_ticket_attributs_ticket_id ON ticket_attributs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_attributs_meta_key ON ticket_attributs(ticket_id, meta_key);

    ALTER TABLE ticket_attributs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can read attributs of accessible tickets"
      ON ticket_attributs FOR SELECT TO authenticated
      USING (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            (visibility = 'public') OR
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid()) OR
            (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
        )
      );
    CREATE POLICY "Users can insert attributs for accessible tickets"
      ON ticket_attributs FOR INSERT TO authenticated
      WITH CHECK (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid()) OR
            (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
        )
      );
    CREATE POLICY "Users can update attributs for accessible tickets"
      ON ticket_attributs FOR UPDATE TO authenticated
      USING (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid())
        )
      );
    CREATE POLICY "Users can delete attributs for accessible tickets"
      ON ticket_attributs FOR DELETE TO authenticated
      USING (
        ticket_id IN (
          SELECT id FROM tickets WHERE
            created_by = auth.uid() OR
            public.is_todo_assignee(id, auth.uid())
        )
      );
  END IF;
END $$;
