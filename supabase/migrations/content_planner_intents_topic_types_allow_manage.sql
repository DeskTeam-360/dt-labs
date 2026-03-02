-- Allow authenticated users to manage intents and topic types (admin)
CREATE POLICY "Authenticated can insert intents"
  ON content_planner_intents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update intents"
  ON content_planner_intents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete intents"
  ON content_planner_intents FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can insert topic types"
  ON content_planner_topic_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update topic types"
  ON content_planner_topic_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete topic types"
  ON content_planner_topic_types FOR DELETE TO authenticated USING (true);
