-- Scheduled website crawls. Same schedule shape as recurring_tickets (daily, weekdays, chosen weekdays, chosen dates of the month, every N days).
-- After a scheduled crawl finishes, pages that are broken now but were not in the previous crawl are emailed to notify_emails.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS crawl_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_website_id uuid NOT NULL REFERENCES company_websites(id) ON DELETE CASCADE,
  frequency varchar(32) NOT NULL DEFAULT 'specific_days',
  specific_days jsonb,
  specific_date jsonb,
  interval_days integer,
  time_of_day varchar(5) NOT NULL DEFAULT '02:00',
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Jakarta',
  start_date date NOT NULL,
  end_date date,
  max_depth integer NOT NULL DEFAULT 3,
  max_pages integer NOT NULL DEFAULT 100,
  notify_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_session_id uuid,
  last_new_broken integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_schedules_next_run_idx ON crawl_schedules (next_run_at) WHERE is_active;

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE crawl_schedules OWNER TO dtlabs;
