-- Fix ticket_type_id column from uuid to integer to match ticket_types.id (integer PK)
ALTER TABLE recurring_tickets
  ALTER COLUMN ticket_type_id TYPE integer USING (ticket_type_id::text)::integer;

GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_tickets TO dtlabs;
