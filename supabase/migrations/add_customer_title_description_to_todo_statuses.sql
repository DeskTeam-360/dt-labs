-- Add customer_title and description columns to todo_statuses (ticket statuses)
-- description may already exist from create_todo_statuses_table.sql; IF NOT EXISTS skips if present
ALTER TABLE todo_statuses ADD COLUMN IF NOT EXISTS customer_title VARCHAR(255);
ALTER TABLE todo_statuses ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
