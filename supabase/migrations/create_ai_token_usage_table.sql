-- Token usage tracking: who used, for what, and how many tokens
-- Format aligns with ai_content_results (ai_model, ai_version, generated_date, content_text, prompt_id, vector_reference_id)
-- Plus: user_id, used_for, prompt_tokens, completion_tokens, total_tokens

CREATE TABLE IF NOT EXISTS ai_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  used_for VARCHAR(100) NOT NULL,
  ai_model VARCHAR(100) NOT NULL,
  ai_version VARCHAR(50),
  generated_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  content_text TEXT,
  prompt_id UUID,
  vector_reference_id UUID,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_id ON ai_token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_used_for ON ai_token_usage(used_for);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_created_at ON ai_token_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_company_id ON ai_token_usage(company_id);

ALTER TABLE ai_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ai_token_usage" ON ai_token_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ai_token_usage" ON ai_token_usage FOR INSERT TO authenticated WITH CHECK (true);
