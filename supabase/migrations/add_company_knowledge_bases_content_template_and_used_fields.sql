-- Add content_template_id and used_fields to company_knowledge_bases (which template + which placeholders were used)
ALTER TABLE company_knowledge_bases
  ADD COLUMN IF NOT EXISTS content_template_id UUID REFERENCES company_content_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS used_fields TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_company_knowledge_bases_content_template_id ON company_knowledge_bases(content_template_id);
