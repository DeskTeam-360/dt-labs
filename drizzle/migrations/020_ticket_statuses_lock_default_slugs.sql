-- Set is_deletable = false for canonical workflow statuses (same slugs as prisma/seed.ts).
-- Run after 019 (or drizzle push) so column exists.
UPDATE "ticket_statuses"
SET "is_deletable" = false
WHERE "slug" IN (
  'open',
  'received',
  'question',
  'working_team',
  'am_review',
  'client_review',
  'feedback_received',
  'revision',
  'pending',
  'resolved',
  'closed'
);
