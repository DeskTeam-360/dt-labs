-- Display name for the shared customer time report preset (singleton row id = 1).
ALTER TABLE customer_time_report_defaults
  ADD COLUMN IF NOT EXISTS title varchar(200) NOT NULL DEFAULT 'Saved filter';
