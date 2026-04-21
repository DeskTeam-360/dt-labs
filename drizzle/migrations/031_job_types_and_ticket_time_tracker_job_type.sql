-- Catalog of work categories for time sessions (slug stored on ticket_time_tracker; no join needed for display if title denormalized in API).
CREATE TABLE IF NOT EXISTS job_types (
  slug varchar(64) PRIMARY KEY,
  title varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO job_types (slug, title, sort_order) VALUES
  ('development', 'Development', 10),
  ('meeting', 'Meeting', 20),
  ('support', 'Support / customer care', 30),
  ('bugfix', 'Bug fix', 40),
  ('review', 'Review / QA', 50),
  ('documentation', 'Documentation', 60),
  ('research', 'Research / investigation', 70),
  ('admin', 'Admin / internal', 80),
  ('other', 'Other', 999)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE ticket_time_tracker
  ADD COLUMN IF NOT EXISTS job_type varchar(64) NULL default 'other';

CREATE INDEX IF NOT EXISTS ticket_time_tracker_job_type_idx ON ticket_time_tracker (job_type);

COMMENT ON TABLE job_types IS 'Time tracker work category choices; slug copied to ticket_time_tracker.job_type.';
COMMENT ON COLUMN ticket_time_tracker.job_type IS 'job_types.slug — what this session was for but not linked.';

GRANT SELECT ON TABLE public.job_types TO PUBLIC;
