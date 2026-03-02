-- Enable Realtime for todo_comments so new reply/note notifications work
-- Run in Supabase SQL Editor if not using migrations. Ignore error if table already in publication.
ALTER PUBLICATION supabase_realtime ADD TABLE todo_comments;
