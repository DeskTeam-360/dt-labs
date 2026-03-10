-- Migration: Rename todo_* tables and todo_id columns to ticket_*
-- Run with: psql $DATABASE_URL -f drizzle/migrations/0001_rename_todo_tables_to_ticket.sql

BEGIN;

-- 1. todo_statuses -> ticket_statuses
ALTER TABLE IF EXISTS todo_statuses RENAME TO ticket_statuses;

-- 2. todo_assignees -> ticket_assignees, todo_id -> ticket_id
ALTER TABLE IF EXISTS todo_assignees RENAME TO ticket_assignees;
ALTER TABLE ticket_assignees DROP CONSTRAINT IF EXISTS todo_assignees_todo_id_fkey;
ALTER TABLE ticket_assignees DROP CONSTRAINT IF EXISTS todo_assignees_todo_id_user_id_key;
ALTER TABLE ticket_assignees RENAME COLUMN todo_id TO ticket_id;
ALTER TABLE ticket_assignees ADD CONSTRAINT ticket_assignees_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_assignees_ticket_id_user_id_key ON ticket_assignees(ticket_id, user_id);
CREATE INDEX IF NOT EXISTS ticket_assignees_ticket_id_idx ON ticket_assignees(ticket_id);

-- 3. todo_checklist -> ticket_checklist, todo_id -> ticket_id
ALTER TABLE IF EXISTS todo_checklist RENAME TO ticket_checklist;
ALTER TABLE ticket_checklist DROP CONSTRAINT IF EXISTS todo_checklist_todo_id_fkey;
ALTER TABLE ticket_checklist RENAME COLUMN todo_id TO ticket_id;
ALTER TABLE ticket_checklist ADD CONSTRAINT ticket_checklist_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS todo_checklist_todo_id_key;
DROP INDEX IF EXISTS todo_checklist_order_index;
CREATE INDEX IF NOT EXISTS ticket_checklist_ticket_id_idx ON ticket_checklist(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_checklist_order_idx ON ticket_checklist(ticket_id, order_index);

-- 4. todo_comments -> ticket_comments, todo_id -> ticket_id
ALTER TABLE IF EXISTS todo_comments RENAME TO ticket_comments;
ALTER TABLE ticket_comments DROP CONSTRAINT IF EXISTS todo_comments_todo_id_fkey;
ALTER TABLE ticket_comments RENAME COLUMN todo_id TO ticket_id;
ALTER TABLE ticket_comments ADD CONSTRAINT ticket_comments_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS todo_comments_todo_id_key;
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_id_idx ON ticket_comments(ticket_id);

-- 5. todo_attributs -> ticket_attributs, todo_id -> ticket_id
ALTER TABLE IF EXISTS todo_attributs RENAME TO ticket_attributs;
ALTER TABLE ticket_attributs DROP CONSTRAINT IF EXISTS todo_attributs_todo_id_fkey;
ALTER TABLE ticket_attributs DROP CONSTRAINT IF EXISTS todo_attributs_todo_id_meta_key_key;
ALTER TABLE ticket_attributs RENAME COLUMN todo_id TO ticket_id;
ALTER TABLE ticket_attributs ADD CONSTRAINT ticket_attributs_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_attributs_ticket_id_meta_key_key ON ticket_attributs(ticket_id, meta_key);
CREATE INDEX IF NOT EXISTS ticket_attributs_ticket_id_idx ON ticket_attributs(ticket_id);

-- 6. todo_time_tracker -> ticket_time_tracker, todo_id -> ticket_id
ALTER TABLE IF EXISTS todo_time_tracker RENAME TO ticket_time_tracker;
ALTER TABLE ticket_time_tracker DROP CONSTRAINT IF EXISTS todo_time_tracker_todo_id_fkey;
ALTER TABLE ticket_time_tracker RENAME COLUMN todo_id TO ticket_id;
ALTER TABLE ticket_time_tracker ADD CONSTRAINT ticket_time_tracker_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS todo_time_tracker_todo_id_key;
CREATE INDEX IF NOT EXISTS ticket_time_tracker_ticket_id_idx ON ticket_time_tracker(ticket_id);

-- 7. screenshots: todo_id -> ticket_id
ALTER TABLE screenshots DROP CONSTRAINT IF EXISTS screenshots_todo_id_fkey;
ALTER TABLE screenshots RENAME COLUMN todo_id TO ticket_id;
ALTER TABLE screenshots ADD CONSTRAINT screenshots_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS screenshots_todo_id_key;
CREATE INDEX IF NOT EXISTS screenshots_ticket_id_idx ON screenshots(ticket_id);

-- 8. Update is_todo_assignee function if exists (from Supabase migrations)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_todo_assignee') THEN
    DROP FUNCTION IF EXISTS public.is_todo_assignee(integer, uuid);
    CREATE OR REPLACE FUNCTION public.is_todo_assignee(ticket_id_param INTEGER, user_id_param UUID)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM ticket_assignees
        WHERE ticket_assignees.ticket_id = ticket_id_param
        AND ticket_assignees.user_id = user_id_param
      );
    END;
    $fn$;
  END IF;
END $$;

COMMIT;
