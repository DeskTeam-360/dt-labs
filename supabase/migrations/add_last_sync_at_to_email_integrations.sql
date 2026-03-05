-- Track last sync for incremental fetches (only check emails since last sync)
ALTER TABLE email_integrations ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
