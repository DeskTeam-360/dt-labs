-- Support tickets marked closed lose queue priority (nullable); duplicates at NULL are OK for partial UNIQUE on (company_id, priority).
ALTER TABLE tickets ALTER COLUMN priority DROP NOT NULL;

UPDATE tickets
SET priority = NULL
WHERE ticket_type = 'support' AND status = 'closed';
