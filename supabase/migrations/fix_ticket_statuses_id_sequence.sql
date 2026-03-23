-- Fix ticket_statuses id sequence (out of sync after rename from todo_statuses)
-- Run this if you get: duplicate key value violates unique constraint "todo_statuses_pkey" / Key (id)=(N) already exists

-- Version 1: Plain SQL (works in psql, DBeaver, Supabase SQL Editor, etc.)
SELECT setval(
  pg_get_serial_sequence('ticket_statuses', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_statuses)
);

-- Version 2: If above fails (e.g. sequence name is todo_statuses_id_seq), use:
-- SELECT setval('todo_statuses_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_statuses));
