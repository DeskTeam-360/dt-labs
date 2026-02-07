-- No longer adding these columns to company_content_planners.
-- Generator params (gbp_per_week, social_per_week, etc.) are used only to CREATE planners, not stored per planner.
-- If columns were added previously, drop them:
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS client_id;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS gbp_per_week;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS social_per_week;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS blogs_per_week;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS blogs_every_n_weeks;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS default_segment;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS preferred_post_days;
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS notes;
