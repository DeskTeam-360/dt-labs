-- Session + soft-delete: lib/auth-user-session.ts and DELETE /api/users/[id] use users.deleted_at.
-- Older databases may lack this column if they were not created from drizzle/0000_charming_shiva.sql.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
