-- Add author_type to todo_comments: who wrote the comment (customer vs agent)
ALTER TABLE todo_comments
  ADD COLUMN IF NOT EXISTS author_type TEXT NOT NULL DEFAULT 'agent'
    CHECK (author_type IN ('customer', 'agent'));

COMMENT ON COLUMN todo_comments.author_type IS 'customer = from client/customer portal; agent = from staff/agent panel';
