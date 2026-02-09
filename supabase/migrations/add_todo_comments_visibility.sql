-- Add visibility to todo_comments: 'reply' = visible to client, 'note' = agent only
ALTER TABLE todo_comments
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'note'
    CHECK (visibility IN ('note', 'reply'));

COMMENT ON COLUMN todo_comments.visibility IS 'reply = visible to client and everyone; note = agent only, hidden from /customer';

CREATE INDEX IF NOT EXISTS idx_todo_comments_visibility ON todo_comments(todo_id, visibility);
