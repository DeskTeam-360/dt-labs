-- A crawl schedule can also take pictures after each crawl and prepare a draft maintenance report from it.
-- Safe to run as postgres or dtlabs.

ALTER TABLE crawl_schedules
  ADD COLUMN IF NOT EXISTS screenshot_homepage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screenshot_random_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_template_key varchar(30);
