-- Add broken_pages column to crawl_sessions table
ALTER TABLE crawl_sessions 
ADD COLUMN IF NOT EXISTS broken_pages INTEGER DEFAULT 0;

-- Add comment to explain broken pages
COMMENT ON COLUMN crawl_sessions.broken_pages IS 'Number of pages with HTTP error status codes (400, 401, 403, 404, 500, 502, 503, 504)';
