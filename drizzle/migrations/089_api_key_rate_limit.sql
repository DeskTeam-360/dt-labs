-- How many calls an API key may make per hour (default 100). Over the limit the API answers 429 until older calls fall out of the hour.
-- Safe to run as postgres or as dtlabs.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_per_hour integer NOT NULL DEFAULT 100;
