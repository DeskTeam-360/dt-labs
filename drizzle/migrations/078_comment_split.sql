-- A reply that was split into its own ticket stays on the original ticket, marked "Split to #N".
-- Run as the application DB user (dtlabs), or as postgres: ticket_comments keeps its owner.

ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS split_to_ticket_id integer;
