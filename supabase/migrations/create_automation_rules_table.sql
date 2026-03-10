-- Automation rules for ticket routing, tagging, priority, etc.
CREATE TABLE IF NOT EXISTS automation_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  event_type VARCHAR(50) NOT NULL DEFAULT 'ticket_created', -- ticket_created, ticket_updated, time_trigger
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0, -- higher = evaluate first
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = global
  status BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_event_status ON automation_rules(event_type, status);
CREATE INDEX IF NOT EXISTS idx_automation_rules_priority ON automation_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_automation_rules_company ON automation_rules(company_id);

COMMENT ON TABLE automation_rules IS 'Rules for auto-tag, assign, priority when tickets are created/updated';
COMMENT ON COLUMN automation_rules.conditions IS 'Nested JSON: { "operator": "AND|OR", "conditions": [...] } or leaf { "field", "operator", "value" }';
COMMENT ON COLUMN automation_rules.actions IS 'JSON: { "assign_group": "billing", "priority": "high", "add_tag": "urgent" }';
