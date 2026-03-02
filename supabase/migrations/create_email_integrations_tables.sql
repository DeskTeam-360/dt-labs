-- Email integrations for Shared Inbox (Google OAuth)
CREATE TABLE IF NOT EXISTS email_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'google',
  email_address VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider)
);

-- Email messages synced from Gmail
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id VARCHAR(255) NOT NULL UNIQUE,
  thread_id VARCHAR(255),
  from_email VARCHAR(255),
  to_email VARCHAR(255),
  subject TEXT,
  snippet TEXT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_integrations_provider ON email_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_email_integrations_is_active ON email_integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_email_messages_gmail_message_id ON email_messages(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_ticket_id ON email_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_synced_at ON email_messages(synced_at);

ALTER TABLE email_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can manage integrations (admin flow)
CREATE POLICY "Authenticated can manage email_integrations"
ON email_integrations FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can manage email_messages"
ON email_messages FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_email_integrations_updated_at
BEFORE UPDATE ON email_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
