ALTER TABLE recurring_tickets
  ADD COLUMN IF NOT EXISTS contact_user_id UUID;

GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_tickets TO dtlabs;
