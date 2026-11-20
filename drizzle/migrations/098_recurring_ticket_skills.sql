-- Skills on a recurring ticket template: copied to every ticket the template creates.
-- skill_ids is a JSON array of skill ids; primary_skill_id is the one that matters most (must be one of skill_ids).
-- The table already belongs to dtlabs; nothing to hand over.

ALTER TABLE recurring_tickets
  ADD COLUMN IF NOT EXISTS skill_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_skill_id uuid;
