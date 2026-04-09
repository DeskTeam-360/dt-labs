-- Singleton row: global default filters for Customer time report (settings UI).
CREATE TABLE IF NOT EXISTS customer_time_report_defaults (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

INSERT INTO customer_time_report_defaults (id, filters) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
