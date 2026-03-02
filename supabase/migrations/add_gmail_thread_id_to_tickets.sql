-- Store Gmail thread ID on ticket to match replies vs new emails
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_tickets_gmail_thread_id ON tickets(gmail_thread_id);
