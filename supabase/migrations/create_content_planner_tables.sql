-- Content Planner: lookup tables and main company_content_planners table
-- Status enum for content planner
CREATE TYPE content_planner_status AS ENUM (
  'planned',
  'draft',
  'ai_generated',
  'human_reviewed',
  'approved',
  'published',
  'needs_update'
);

-- CTA type enum
CREATE TYPE content_planner_cta_type AS ENUM (
  'call',
  'visit_website',
  'get_quote',
  'book_consultation',
  'learn_more'
);

-- Intents lookup
CREATE TABLE IF NOT EXISTS content_planner_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_content_planner_intents_updated_at
  BEFORE UPDATE ON content_planner_intents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Formats lookup
CREATE TABLE IF NOT EXISTS content_planner_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_content_planner_formats_updated_at
  BEFORE UPDATE ON content_planner_formats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Channels lookup
CREATE TABLE IF NOT EXISTS content_planner_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_content_planner_channels_updated_at
  BEFORE UPDATE ON content_planner_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Main company_content_planners table
CREATE TABLE IF NOT EXISTS company_content_planners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_id TEXT,
  channel_id UUID REFERENCES content_planner_channels(id) ON DELETE SET NULL,
  topic VARCHAR(255),
  primary_keyword VARCHAR(255),
  secondary_keywords TEXT,
  intents UUID[] DEFAULT '{}',
  location VARCHAR(255),
  format_id UUID REFERENCES content_planner_formats(id) ON DELETE SET NULL,
  cta_dynamic BOOLEAN NOT NULL DEFAULT false,
  cta_type content_planner_cta_type,
  cta_text TEXT,
  publish_date DATE,
  status content_planner_status NOT NULL DEFAULT 'planned',
  insight TEXT,
  ai_content_results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT cta_required_when_not_dynamic CHECK (
    (cta_dynamic = true) OR
    (cta_dynamic = false AND cta_type IS NOT NULL AND cta_text IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_company_content_planners_company_id ON company_content_planners(company_id);
CREATE INDEX IF NOT EXISTS idx_company_content_planners_status ON company_content_planners(status);
CREATE INDEX IF NOT EXISTS idx_company_content_planners_publish_date ON company_content_planners(publish_date);

CREATE TRIGGER update_company_content_planners_updated_at
  BEFORE UPDATE ON company_content_planners
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE content_planner_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_planner_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_planner_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_content_planners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read intents" ON content_planner_intents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read formats" ON content_planner_formats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read channels" ON content_planner_channels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read company_content_planners" ON company_content_planners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert company_content_planners" ON company_content_planners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update company_content_planners" ON company_content_planners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete company_content_planners" ON company_content_planners FOR DELETE TO authenticated USING (true);

-- Seed intents (only when table is empty)
INSERT INTO content_planner_intents (title)
SELECT v FROM unnest(ARRAY[
  'Brand Awareness'::text, 'Lead Generation', 'Sales', 'Customer Support', 'Educational',
  'Engagement', 'News and Information', 'Transactional', 'Informational', 'Commercial', 'Local'
]) AS v
WHERE NOT EXISTS (SELECT 1 FROM content_planner_intents LIMIT 1);

-- Seed formats
INSERT INTO content_planner_formats (title)
SELECT x FROM unnest(ARRAY['Blog', 'Landing Page', 'Social Post', 'Website Page']) x
WHERE NOT EXISTS (SELECT 1 FROM content_planner_formats LIMIT 1);

-- Seed channels
INSERT INTO content_planner_channels (title)
SELECT x FROM unnest(ARRAY['GBP', 'Website', 'Blog', 'Landing Page', 'Social']) x
WHERE NOT EXISTS (SELECT 1 FROM content_planner_channels LIMIT 1);
