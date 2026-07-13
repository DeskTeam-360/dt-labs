-- Recurring tickets: template + schedule for auto-creating tickets
CREATE TABLE IF NOT EXISTS recurring_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  frequency VARCHAR(32) NOT NULL DEFAULT 'daily',
  specific_days JSONB,
  specific_date INTEGER,
  interval_days INTEGER,
  time_of_day VARCHAR(5) NOT NULL DEFAULT '08:00',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  ticket_status VARCHAR(128),
  ticket_priority INTEGER DEFAULT 0,
  team_id UUID,
  company_id UUID,
  assignee_ids JSONB DEFAULT '[]',
  ticket_type_id UUID,
  visibility VARCHAR(32) NOT NULL DEFAULT 'public',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_tickets_next_run_idx ON recurring_tickets (next_run_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS recurring_tickets_is_active_idx ON recurring_tickets (is_active);

-- Run log: every ticket created by a recurring rule
CREATE TABLE IF NOT EXISTS recurring_ticket_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_ticket_id UUID NOT NULL REFERENCES recurring_tickets(id) ON DELETE CASCADE,
  ticket_id INTEGER,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  error TEXT
);

CREATE INDEX IF NOT EXISTS recurring_ticket_runs_rule_idx ON recurring_ticket_runs (recurring_ticket_id);
CREATE INDEX IF NOT EXISTS recurring_ticket_runs_ran_at_idx ON recurring_ticket_runs (ran_at);
