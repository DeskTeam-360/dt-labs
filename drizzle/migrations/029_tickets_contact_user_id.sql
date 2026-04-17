-- Primary contact for customer email replies (optional; null = use created_by).
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS contact_user_id uuid;

COMMENT ON COLUMN tickets.contact_user_id IS 'User who receives agent email replies; NULL means use created_by.';

DO $$
BEGIN
  ALTER TABLE tickets
    ADD CONSTRAINT tickets_contact_user_id_fkey
    FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
