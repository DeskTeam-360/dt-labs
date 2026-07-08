-- Preserve the original description content before any edits (e.g. from email)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS original_description text;
