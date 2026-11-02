-- Links on a crawled page that point to another domain (url, link text, tag such as "external" or "external:nofollow"), kept for a person to review.
-- Safe to run as postgres or as dtlabs.

ALTER TABLE crawl_pages ADD COLUMN IF NOT EXISTS external_links jsonb;
