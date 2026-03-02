-- Add default AI template per channel so generate can use it when set
ALTER TABLE content_planner_channels
  ADD COLUMN IF NOT EXISTS company_ai_system_template_id UUID REFERENCES company_ai_system_template(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_planner_channels_company_ai_system_template_id
  ON content_planner_channels(company_ai_system_template_id);

-- Allow updating channels (e.g. to set default template)
CREATE POLICY "Authenticated can update channels"
  ON content_planner_channels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
