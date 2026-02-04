-- History of content generated from knowledge base (RAG) per company
CREATE TABLE IF NOT EXISTS company_content_generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_content_generation_history_company_id ON company_content_generation_history(company_id);
CREATE INDEX IF NOT EXISTS idx_company_content_generation_history_created_at ON company_content_generation_history(created_at DESC);

ALTER TABLE company_content_generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company_content_generation_history"
  ON company_content_generation_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert company_content_generation_history"
  ON company_content_generation_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete company_content_generation_history"
  ON company_content_generation_history FOR DELETE
  TO authenticated
  USING (true);
