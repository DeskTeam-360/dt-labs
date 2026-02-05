-- Add color option (default black) to ticket_types, tags, and companies

-- Ticket types: set default color to black (table may already exist with other default)
ALTER TABLE ticket_types
  ALTER COLUMN color SET DEFAULT '#000000';

-- Tags: add color column, default black
ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS color VARCHAR(20) NOT NULL DEFAULT '#000000';

-- Companies: add color column, default black
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS color VARCHAR(20) NOT NULL DEFAULT '#000000';
