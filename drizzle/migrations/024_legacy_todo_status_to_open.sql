-- Legacy todo seed used slug `to_do` as first status; app expects canonical `open` for new tickets.
-- 1) Re-point tickets
UPDATE tickets SET status = 'open' WHERE status = 'to_do';

-- 2) If canonical `open` already exists, remove duplicate `to_do` row
DELETE FROM ticket_statuses
WHERE slug = 'to_do'
  AND EXISTS (SELECT 1 FROM ticket_statuses t WHERE t.slug = 'open');

-- 3) Otherwise rename the lone `to_do` row to `open`
UPDATE ticket_statuses
SET slug = 'open', title = 'Open'
WHERE slug = 'to_do';
