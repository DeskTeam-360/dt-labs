-- Active time (hours) may now be a fraction with up to 2 decimals, e.g. 0.1 or 0.25. Existing whole hours keep their value.
-- Safe to run as postgres or as dtlabs.

ALTER TABLE companies ALTER COLUMN active_time TYPE numeric(7,2) USING active_time::numeric(7,2);
ALTER TABLE companies ALTER COLUMN active_time SET DEFAULT 0;
ALTER TABLE company_daily_active_assignments ALTER COLUMN active_time TYPE numeric(7,2) USING active_time::numeric(7,2);
ALTER TABLE company_daily_active_assignments ALTER COLUMN active_time SET DEFAULT 0;
