-- Add email column to companies for reply-to when sending ticket replies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

COMMENT ON COLUMN companies.email IS 'Company contact email - used as reply-to when sending ticket replies';
