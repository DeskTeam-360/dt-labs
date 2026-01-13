-- Create screenshots table for storing screenshot metadata
CREATE TABLE IF NOT EXISTS screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- File info
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  
  -- Integration with projects/todos
  todo_id UUID REFERENCES todos(id) ON DELETE SET NULL,
  project_id UUID, -- Can be added if you have projects table
  
  -- Metadata
  title VARCHAR(255),
  description TEXT,
  tags TEXT[], -- Array of tags
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON screenshots(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_todo_id ON screenshots(todo_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at);
CREATE INDEX IF NOT EXISTS idx_screenshots_project_id ON screenshots(project_id);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_screenshots_title_description ON screenshots USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- RLS Policies
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;

-- Users can read their own screenshots
CREATE POLICY "Users can read own screenshots"
ON screenshots FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own screenshots
CREATE POLICY "Users can create own screenshots"
ON screenshots FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own screenshots
CREATE POLICY "Users can update own screenshots"
ON screenshots FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own screenshots
CREATE POLICY "Users can delete own screenshots"
ON screenshots FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger for auto update updated_at
CREATE TRIGGER update_screenshots_updated_at 
BEFORE UPDATE ON screenshots
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();
