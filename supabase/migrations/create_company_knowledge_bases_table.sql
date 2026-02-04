-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create company_knowledge_bases table (embeddings + metadata for RAG/semantic search)
CREATE TABLE IF NOT EXISTS company_knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  type TEXT,
  content TEXT,
  embedding vector(1536),
  source_ids UUID[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for filtering and lookup
CREATE INDEX IF NOT EXISTS idx_company_knowledge_bases_company_id ON company_knowledge_bases(company_id);
CREATE INDEX IF NOT EXISTS idx_company_knowledge_bases_type ON company_knowledge_bases(type);
CREATE INDEX IF NOT EXISTS idx_company_knowledge_bases_created_at ON company_knowledge_bases(created_at);

-- Optional: index for vector similarity search (uncomment and run after you have data; adjust lists as needed)
-- CREATE INDEX IF NOT EXISTS idx_company_knowledge_bases_embedding ON company_knowledge_bases
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Trigger for updated_at
CREATE TRIGGER update_company_knowledge_bases_updated_at
  BEFORE UPDATE ON company_knowledge_bases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE company_knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company_knowledge_bases"
  ON company_knowledge_bases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert company_knowledge_bases"
  ON company_knowledge_bases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update company_knowledge_bases"
  ON company_knowledge_bases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete company_knowledge_bases"
  ON company_knowledge_bases FOR DELETE
  TO authenticated
  USING (true);
