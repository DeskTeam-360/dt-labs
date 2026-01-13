-- Create API tokens table for extension authentication
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL DEFAULT 'Chrome Extension',
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
CREATE INDEX IF NOT EXISTS idx_api_tokens_is_active ON api_tokens(is_active);

-- RLS Policies
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own tokens
CREATE POLICY "Users can read own tokens"
ON api_tokens FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own tokens
CREATE POLICY "Users can create own tokens"
ON api_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update own tokens"
ON api_tokens FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own tokens"
ON api_tokens FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger for auto update updated_at
CREATE TRIGGER update_api_tokens_updated_at 
BEFORE UPDATE ON api_tokens
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();
