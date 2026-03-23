-- Fix id sequences (out of sync) for ticket_statuses, ticket_types, ticket_priorities
-- Run if you get: duplicate key value violates unique constraint / Key (id)=(N) already exists
-- Plain SQL - works in psql, DBeaver, Supabase SQL Editor

-- ticket_statuses (was todo_statuses - if pg_get_serial_sequence returns null, use: setval('todo_statuses_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_statuses))
SELECT setval(
  pg_get_serial_sequence('ticket_statuses', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_statuses)
);

-- ticket_types
SELECT setval(
  pg_get_serial_sequence('ticket_types', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_types)
);

-- ticket_priorities
SELECT setval(
  pg_get_serial_sequence('ticket_priorities', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM ticket_priorities)
);
