-- Public / reference text for ticket types and priorities (statuses already have description).
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE ticket_priorities
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
