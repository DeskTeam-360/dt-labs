-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create company_users table (junction table)
CREATE TABLE IF NOT EXISTS company_users (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

-- Create company_data_templates table
CREATE TABLE IF NOT EXISTS company_data_templates (
  id VARCHAR(255) PRIMARY KEY, -- slug from title
  title VARCHAR(255) NOT NULL,
  "group" VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create company_content_templates table
CREATE TABLE IF NOT EXISTS company_content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create company_datas table
CREATE TABLE IF NOT EXISTS company_datas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  data_template_id VARCHAR(255) NOT NULL REFERENCES company_data_templates(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, data_template_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies(created_at);

CREATE INDEX IF NOT EXISTS idx_company_users_company_id ON company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON company_users(user_id);

CREATE INDEX IF NOT EXISTS idx_company_data_templates_group ON company_data_templates("group");
CREATE INDEX IF NOT EXISTS idx_company_data_templates_is_active ON company_data_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_company_datas_company_id ON company_datas(company_id);
CREATE INDEX IF NOT EXISTS idx_company_datas_template_id ON company_datas(data_template_id);

-- Trigger for auto update updated_at on companies
CREATE TRIGGER update_companies_updated_at 
BEFORE UPDATE ON companies
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auto update updated_at on company_users
CREATE TRIGGER update_company_users_updated_at 
BEFORE UPDATE ON company_users
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auto update updated_at on company_data_templates
CREATE TRIGGER update_company_data_templates_updated_at 
BEFORE UPDATE ON company_data_templates
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auto update updated_at on company_content_templates
CREATE TRIGGER update_company_content_templates_updated_at 
BEFORE UPDATE ON company_content_templates
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for auto update updated_at on company_datas
CREATE TRIGGER update_company_datas_updated_at 
BEFORE UPDATE ON company_datas
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_data_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_content_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_datas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for companies
CREATE POLICY "Authenticated users can read all companies"
  ON companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete companies"
  ON companies FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_users
CREATE POLICY "Authenticated users can read all company_users"
  ON company_users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert company_users"
  ON company_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company_users"
  ON company_users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete company_users"
  ON company_users FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_data_templates
CREATE POLICY "Authenticated users can read all company_data_templates"
  ON company_data_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert company_data_templates"
  ON company_data_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company_data_templates"
  ON company_data_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete company_data_templates"
  ON company_data_templates FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_content_templates
CREATE POLICY "Authenticated users can read all company_content_templates"
  ON company_content_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert company_content_templates"
  ON company_content_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company_content_templates"
  ON company_content_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete company_content_templates"
  ON company_content_templates FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_datas
CREATE POLICY "Authenticated users can read all company_datas"
  ON company_datas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert company_datas"
  ON company_datas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company_datas"
  ON company_datas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete company_datas"
  ON company_datas FOR DELETE
  TO authenticated
  USING (true);

