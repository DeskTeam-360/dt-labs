ALTER TABLE "ticket_comments"
  ADD COLUMN "edited_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN "edited_at" timestamp;
