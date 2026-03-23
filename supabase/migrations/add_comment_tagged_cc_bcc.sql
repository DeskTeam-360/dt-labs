-- Add tagged_user_ids, cc_emails, bcc_emails to ticket_comments
ALTER TABLE ticket_comments
ADD COLUMN IF NOT EXISTS tagged_user_ids uuid[],
ADD COLUMN IF NOT EXISTS cc_emails text[],
ADD COLUMN IF NOT EXISTS bcc_emails text[];
