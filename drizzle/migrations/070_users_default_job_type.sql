-- Per-user default job type preselected in the ticket Time Tracker (job_types.slug).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_job_type varchar(64);
