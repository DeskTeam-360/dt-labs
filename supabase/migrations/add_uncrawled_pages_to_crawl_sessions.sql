-- Add uncrawled_pages column to crawl_sessions table
ALTER TABLE crawl_sessions 
ADD COLUMN IF NOT EXISTS uncrawled_pages INTEGER DEFAULT 0;

-- Update existing records to set uncrawled_pages to 0 if NULL
UPDATE crawl_sessions 
SET uncrawled_pages = 0 
WHERE uncrawled_pages IS NULL;

