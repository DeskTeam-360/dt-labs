-- Slack Incoming Webhook rules (no RLS).
CREATE TABLE IF NOT EXISTS slack_ticket_notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  webhook_url TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_ticket_notif_rules_enabled
  ON slack_ticket_notification_rules (is_enabled);
