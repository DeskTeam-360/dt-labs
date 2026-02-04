-- Library: AI system templates [id, content, title, format]
CREATE TABLE IF NOT EXISTS company_ai_system_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  format TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_ai_system_template_title ON company_ai_system_template(title);
CREATE INDEX IF NOT EXISTS idx_company_ai_system_template_created_at ON company_ai_system_template(created_at DESC);

CREATE TRIGGER update_company_ai_system_template_updated_at
  BEFORE UPDATE ON company_ai_system_template
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE company_ai_system_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company_ai_system_template"
  ON company_ai_system_template FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert company_ai_system_template"
  ON company_ai_system_template FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update company_ai_system_template"
  ON company_ai_system_template FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete company_ai_system_template"
  ON company_ai_system_template FOR DELETE
  TO authenticated
  USING (true);
