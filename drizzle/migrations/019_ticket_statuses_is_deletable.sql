-- Ticket statuses: lock seeded rows via is_deletable; align new ticket default with seeded "open" slug.
ALTER TABLE "ticket_statuses" ADD COLUMN IF NOT EXISTS "is_deletable" boolean NOT NULL DEFAULT true;
ALTER TABLE "tickets" ALTER COLUMN "status" SET DEFAULT 'open';
