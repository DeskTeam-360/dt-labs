-- Allow authenticated users to insert new channels (e.g. when importing from sheet and channel not found)
CREATE POLICY "Authenticated can insert channels"
  ON content_planner_channels FOR INSERT TO authenticated WITH CHECK (true);
