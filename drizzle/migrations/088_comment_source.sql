-- Marks comments that were written through the API (and by which AI assistant), so the ticket can show "via API".
-- Safe to run as postgres or as dtlabs.

ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS source varchar(16);
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS source_label varchar(60);
