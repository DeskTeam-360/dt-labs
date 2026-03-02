-- Store RFC Message-ID header for proper email threading (In-Reply-To, References)
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS rfc_message_id VARCHAR(512);
