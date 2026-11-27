-- The WordPress check (Check now) is kept per crawl: what the site reported when this crawl was looked at.
-- A maintenance report tied to the crawl reads this snapshot instead of the latest live data.
-- Safe to run as postgres or dtlabs.

ALTER TABLE crawl_sessions
  ADD COLUMN IF NOT EXISTS wp_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS wp_snapshot_at timestamptz;
