-- Tags copied onto every ticket a recurring rule creates.
ALTER TABLE recurring_tickets
  ADD COLUMN IF NOT EXISTS tag_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
