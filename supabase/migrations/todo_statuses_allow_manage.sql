-- Allow authenticated users to insert, update, delete todo_statuses (for settings UI)
-- Idempotent: drop first in case they were added by create_todo_statuses_table.sql
DROP POLICY IF EXISTS "Authenticated can insert todo statuses" ON todo_statuses;
DROP POLICY IF EXISTS "Authenticated can update todo statuses" ON todo_statuses;
DROP POLICY IF EXISTS "Authenticated can delete todo statuses" ON todo_statuses;

CREATE POLICY "Authenticated can insert todo statuses"
  ON todo_statuses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update todo statuses"
  ON todo_statuses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete todo statuses"
  ON todo_statuses FOR DELETE
  TO authenticated
  USING (true);
