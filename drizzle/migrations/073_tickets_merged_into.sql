-- Ticket merge: secondary tickets point at the primary ticket they were merged into ("Part of #N").
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS merged_into_ticket_id integer;
CREATE INDEX IF NOT EXISTS tickets_merged_into_ticket_id_idx
  ON tickets (merged_into_ticket_id) WHERE merged_into_ticket_id IS NOT NULL;
