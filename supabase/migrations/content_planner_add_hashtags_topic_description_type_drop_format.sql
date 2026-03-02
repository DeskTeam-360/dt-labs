-- Content Planner: add Hashtags, Topic Description, Topic Type; remove Format
-- 1. Create topic types lookup table
CREATE TABLE IF NOT EXISTS content_planner_topic_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_content_planner_topic_types_updated_at
  BEFORE UPDATE ON content_planner_topic_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Add new columns to company_content_planners
ALTER TABLE company_content_planners
  ADD COLUMN IF NOT EXISTS hashtags TEXT,
  ADD COLUMN IF NOT EXISTS topic_description TEXT,
  ADD COLUMN IF NOT EXISTS topic_type_id UUID REFERENCES content_planner_topic_types(id) ON DELETE SET NULL;

-- 3. Drop format_id (and its FK) from company_content_planners
ALTER TABLE company_content_planners
  DROP COLUMN IF EXISTS format_id;

-- 4. RLS for topic types
ALTER TABLE content_planner_topic_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read topic types"
  ON content_planner_topic_types FOR SELECT TO authenticated USING (true);

-- 5. Index for topic_type_id (optional, for filters)
CREATE INDEX IF NOT EXISTS idx_company_content_planners_topic_type_id
  ON company_content_planners(topic_type_id);

-- 6. Seed topic types (only when table is empty)
INSERT INTO content_planner_topic_types (title)
SELECT x FROM unnest(ARRAY[
  'How-to'::text,
  'Listicle',
  'Tutorial',
  'News / Update',
  'Case Study',
  'Comparison',
  'FAQ',
  'Thought Leadership',
  'Product / Service',
  'Other'
]) x
WHERE NOT EXISTS (SELECT 1 FROM content_planner_topic_types LIMIT 1);
