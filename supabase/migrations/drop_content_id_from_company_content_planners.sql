-- Remove content_id from company_content_planners (id is used as the content identifier)
ALTER TABLE company_content_planners DROP COLUMN IF EXISTS content_id;
