-- Every change to a person's skill level (new skill, level up/down, skill removed), so improvement can be followed over time.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS user_skill_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  old_level integer,
  new_level integer,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_skill_history_user_idx ON user_skill_history (user_id, changed_at DESC);

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE user_skill_history OWNER TO dtlabs;
