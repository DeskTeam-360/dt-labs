-- A maintenance report is tied to the crawl it was made from (broken links, pictures). Older reports keep NULL and use the latest crawl as before.
-- Safe to run as postgres or dtlabs.

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS crawl_session_id uuid REFERENCES crawl_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_reports_crawl_idx ON maintenance_reports (crawl_session_id);
