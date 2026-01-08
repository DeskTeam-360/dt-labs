-- Create company_websites table
CREATE TABLE IF NOT EXISTS company_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create crawl_sessions table
CREATE TABLE IF NOT EXISTS crawl_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_website_id UUID NOT NULL REFERENCES company_websites(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  total_pages INTEGER DEFAULT 0,
  crawled_pages INTEGER DEFAULT 0,
  failed_pages INTEGER DEFAULT 0,
  error_message TEXT,
  max_depth INTEGER DEFAULT 3,
  max_pages INTEGER DEFAULT 100,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create crawl_pages table
CREATE TABLE IF NOT EXISTS crawl_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  depth INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  http_status_code INTEGER,
  content_type VARCHAR(255),
  heading_hierarchy JSONB,
  meta_tags JSONB,
  links JSONB,
  crawled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for company_websites
CREATE INDEX IF NOT EXISTS idx_company_websites_company_id ON company_websites(company_id);
CREATE INDEX IF NOT EXISTS idx_company_websites_url ON company_websites(url);
CREATE INDEX IF NOT EXISTS idx_company_websites_is_primary ON company_websites(is_primary);
CREATE INDEX IF NOT EXISTS idx_company_websites_created_at ON company_websites(created_at);

-- Indexes for crawl_sessions
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_company_website_id ON crawl_sessions(company_website_id);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_status ON crawl_sessions(status);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_created_at ON crawl_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_started_at ON crawl_sessions(started_at);

-- Indexes for crawl_pages
CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawl_session_id ON crawl_pages(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_url ON crawl_pages(url);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_status ON crawl_pages(status);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_depth ON crawl_pages(depth);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawled_at ON crawl_pages(crawled_at);

-- Trigger for auto update updated_at on company_websites
CREATE TRIGGER update_company_websites_updated_at 
BEFORE UPDATE ON company_websites
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auto update updated_at on crawl_sessions
CREATE TRIGGER update_crawl_sessions_updated_at 
BEFORE UPDATE ON crawl_sessions
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auto update updated_at on crawl_pages
CREATE TRIGGER update_crawl_pages_updated_at 
BEFORE UPDATE ON crawl_pages
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE company_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_websites
CREATE POLICY "Authenticated users can read all company_websites"
  ON company_websites FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert company_websites"
  ON company_websites FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company_websites"
  ON company_websites FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete company_websites"
  ON company_websites FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for crawl_sessions
CREATE POLICY "Authenticated users can read all crawl_sessions"
  ON crawl_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert crawl_sessions"
  ON crawl_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update crawl_sessions"
  ON crawl_sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crawl_sessions"
  ON crawl_sessions FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for crawl_pages
CREATE POLICY "Authenticated users can read all crawl_pages"
  ON crawl_pages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert crawl_pages"
  ON crawl_pages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update crawl_pages"
  ON crawl_pages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crawl_pages"
  ON crawl_pages FOR DELETE
  TO authenticated
  USING (true);

