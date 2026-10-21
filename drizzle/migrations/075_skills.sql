-- Skills: catalog, skills per user, skills required per ticket, and default skills per company + ticket type.
-- Run as the application DB user (dtlabs) so the app owns the new tables.

CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  color varchar(20) DEFAULT '#1677ff',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS user_skills (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  -- Proficiency 1 (beginner) .. 10 (expert). Stored only; not used by the assignee recommendation yet.
  level smallint NOT NULL DEFAULT 5 CHECK (level BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS ticket_skills (
  ticket_id integer NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  -- The one skill that matters most for this ticket (optional, at most one per ticket).
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, skill_id)
);

-- Pre-skills: a new ticket of this type for this company starts with these skills (editable per ticket).
CREATE TABLE IF NOT EXISTS company_type_skills (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type_id integer NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, type_id, skill_id)
);
CREATE INDEX IF NOT EXISTS ticket_skills_skill_idx ON ticket_skills (skill_id);
CREATE INDEX IF NOT EXISTS user_skills_skill_idx ON user_skills (skill_id);
