-- Store all emails ever CC'd on a ticket for auto-CC on future replies
CREATE TABLE IF NOT EXISTS ticket_cc_recipients (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(ticket_id, email)
);
CREATE INDEX IF NOT EXISTS idx_ticket_cc_recipients_ticket_id ON ticket_cc_recipients(ticket_id);
