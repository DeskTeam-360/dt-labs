-- Add company_content_planner_id to ai_token_usage (runs after create_content_planner_tables)
ALTER TABLE ai_token_usage
  ADD COLUMN IF NOT EXISTS company_content_planner_id UUID REFERENCES company_content_planners(id) ON DELETE SET NULL;
