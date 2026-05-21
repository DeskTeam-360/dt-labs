-- Tickets: kolom priority (bilangan bulat), lepas FK ke ticket_priorities
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

UPDATE tickets SET priority = COALESCE(
  (SELECT COALESCE(tp.sort_order, tp.id)::integer
   FROM ticket_priorities tp
   WHERE tp.id = tickets.priority_id),
  0
);

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_priority_id_ticket_priorities_id_fk;
ALTER TABLE tickets DROP COLUMN IF EXISTS priority_id;
