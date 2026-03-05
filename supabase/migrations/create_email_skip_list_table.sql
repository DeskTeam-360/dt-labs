-- Email addresses yang tidak perlu dijadikan ticket atau user (skip list)
CREATE TABLE IF NOT EXISTS email_skip_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_skip_list_email ON email_skip_list(email);

ALTER TABLE email_skip_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage email_skip_list"
ON email_skip_list FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
