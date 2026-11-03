-- A crawl can take screenshots of its homepage and some random inner pages when it finishes (desktop and mobile, whole page).
-- started_by is the person who started it: the pictures are saved under their name.
-- Safe to run as postgres or as dtlabs.

ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS started_by uuid;
ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS screenshot_homepage boolean NOT NULL DEFAULT false;
ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS screenshot_random_count integer NOT NULL DEFAULT 0;
