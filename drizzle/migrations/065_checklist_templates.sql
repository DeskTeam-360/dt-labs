-- Add group_name to ticket_checklist
ALTER TABLE ticket_checklist ADD COLUMN IF NOT EXISTS group_name text;

-- Checklist templates
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_template_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  order_index integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  group_id uuid REFERENCES checklist_template_groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  order_index integer DEFAULT 0
);
