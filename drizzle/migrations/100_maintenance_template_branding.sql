-- Maintenance report templates: custom header and footer (text and/or image), colours, ordering, and a switch to hide a template.
-- Empty values fall back to the built-in look (DeskTeam360 logo, magenta, www.DeskTeam360.com). Safe to run as postgres or dtlabs.

ALTER TABLE maintenance_templates
  ADD COLUMN IF NOT EXISTS header_title text,
  ADD COLUMN IF NOT EXISTS header_subtitle text,
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS footer_image_url text,
  ADD COLUMN IF NOT EXISTS color_primary varchar(9),
  ADD COLUMN IF NOT EXISTS color_section varchar(9),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE maintenance_templates SET sort_order = CASE key WHEN 'weekly' THEN 1 WHEN 'monthly' THEN 2 ELSE sort_order END WHERE sort_order = 0;
