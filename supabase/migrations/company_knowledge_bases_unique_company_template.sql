-- One row per (company_id, content_template_id): same pair => update instead of new row
ALTER TABLE company_knowledge_bases
  DROP CONSTRAINT IF EXISTS company_knowledge_bases_company_template_key;
ALTER TABLE company_knowledge_bases
  ADD CONSTRAINT company_knowledge_bases_company_template_key UNIQUE (company_id, content_template_id);
