-- Add created_via to tickets: 'email' | 'portal' | 'website' | 'slack' (future)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_via VARCHAR(50);

-- Allow created_by to be null for tickets created via email before user is resolved
ALTER TABLE tickets ALTER COLUMN created_by DROP NOT NULL;
