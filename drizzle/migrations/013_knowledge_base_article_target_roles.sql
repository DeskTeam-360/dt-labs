-- KB articles: restrict visibility by role(s). NULL or empty = all roles (legacy / default).
ALTER TABLE knowledge_base_articles
  ADD COLUMN IF NOT EXISTS target_roles text[];
