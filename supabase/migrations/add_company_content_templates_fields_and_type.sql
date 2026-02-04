-- Add fields (text[]) and type (text) to company_content_templates
ALTER TABLE company_content_templates
  ADD COLUMN IF NOT EXISTS fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS type TEXT;
