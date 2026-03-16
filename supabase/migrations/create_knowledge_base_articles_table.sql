-- Ensure update_updated_at_column exists (in case run standalone)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS '
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
';

-- Knowledge Base Articles: artikel edukasi untuk customer (FAQ, panduan, dll)
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_articles_status ON knowledge_base_articles(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_articles_category ON knowledge_base_articles(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_articles_sort_order ON knowledge_base_articles(sort_order);

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_base_articles_updated_at
  BEFORE UPDATE ON knowledge_base_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;

-- Semua authenticated bisa baca (untuk customer dashboard)
CREATE POLICY "Authenticated can read knowledge_base_articles"
  ON knowledge_base_articles FOR SELECT
  TO authenticated
  USING (true);

-- Hanya role admin/agent bisa insert/update/delete (di app layer)
CREATE POLICY "Authenticated can insert knowledge_base_articles"
  ON knowledge_base_articles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update knowledge_base_articles"
  ON knowledge_base_articles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete knowledge_base_articles"
  ON knowledge_base_articles FOR DELETE
  TO authenticated
  USING (true);
