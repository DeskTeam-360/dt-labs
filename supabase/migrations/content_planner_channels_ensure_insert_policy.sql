-- Ensure INSERT is allowed on content_planner_channels (e.g. when importing and channel like "Instagram" is missing)
DROP POLICY IF EXISTS "Authenticated can insert channels" ON content_planner_channels;
CREATE POLICY "Authenticated can insert channels"
  ON content_planner_channels FOR INSERT TO authenticated WITH CHECK (true);
