-- Website maintenance reports: a checklist (weekly or monthly) filled in per website. Items marked with a source are filled by the system
-- (SSL, plugin updates, Wordfence, screenshots, broken links, domain variants); the rest are checked by the developer.
-- Each report keeps its own copy of the items, so changing a template later never rewrites old reports.
-- Safe to run as postgres or as dtlabs: the new tables are handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS maintenance_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(30) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES maintenance_templates(id) ON DELETE CASCADE,
  pos integer NOT NULL,
  section varchar(100) NOT NULL,
  label text NOT NULL,
  -- The first option is the good outcome; any other is a problem.
  options text[] NOT NULL DEFAULT ARRAY['Done'],
  -- How the system fills it (ssl, plugin_updates, malware, broken_links, domain_www, domain_https, shot_home_desktop, ...); null = by hand.
  source varchar(40)
);
CREATE INDEX IF NOT EXISTS maintenance_template_items_tpl_idx ON maintenance_template_items (template_id, pos);

CREATE TABLE IF NOT EXISTS maintenance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id uuid NOT NULL REFERENCES company_websites(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  template_key varchar(30) NOT NULL,
  template_name varchar(100) NOT NULL,
  period_date date NOT NULL DEFAULT CURRENT_DATE,
  developer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  conclusion text,
  -- For the public report page (a hash address); null = not shared.
  share_token varchar(64) UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
CREATE INDEX IF NOT EXISTS maintenance_reports_website_idx ON maintenance_reports (website_id, period_date DESC);
CREATE INDEX IF NOT EXISTS maintenance_reports_company_idx ON maintenance_reports (company_id, period_date DESC);

CREATE TABLE IF NOT EXISTS maintenance_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES maintenance_reports(id) ON DELETE CASCADE,
  pos integer NOT NULL,
  section varchar(100) NOT NULL,
  label text NOT NULL,
  options text[] NOT NULL DEFAULT ARRAY['Done'],
  source varchar(40),
  status text,
  note text,
  link_url text,
  developer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  checked_on date,
  -- true when the system filled status/note; edited = a person changed it afterwards (a refresh then leaves it alone).
  auto_filled boolean NOT NULL DEFAULT false,
  edited boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS maintenance_report_items_report_idx ON maintenance_report_items (report_id, pos);

-- Templates (copied from the weekly and monthly sheets).
INSERT INTO maintenance_templates (key, name) VALUES ('weekly', 'Weekly Website Maintenance'), ('monthly', 'Monthly Website Maintenance')
ON CONFLICT (key) DO NOTHING;

WITH t AS (SELECT id FROM maintenance_templates WHERE key = 'weekly')
INSERT INTO maintenance_template_items (template_id, pos, section, label, options, source)
SELECT t.id, v.pos, v.section, v.label, v.options, v.source FROM t, (VALUES
  (1,  'Security Check', 'Scan malware', ARRAY['No malware found','Malware found'], 'malware'),
  (2,  'Security Check', 'Block IP/Country IP that not related to the site business', ARRAY['Not block any IP','Blocked IP'], NULL),
  (3,  'Security Check', 'Check and remove Spam comment', ARRAY['No spam found','Spam found and has been removed'], NULL),
  (4,  'Security Check', 'Check and remove Spam form', ARRAY['No spam found','Spam found and has been removed'], NULL),
  (5,  'Security Check', 'SSL Check & Fix', ARRAY['SSL is active','SSL problem'], 'ssl'),
  (6,  'Security Check', 'Disable Code Execution for Uploads directory on Wordfence', ARRAY['Done'], NULL),
  (7,  'Security Check', 'DELETE the File Manager Plugin after use', ARRAY['Done'], NULL),
  (8,  'Finalize and UI Check', 'Check Homepage Desktop', ARRAY['Done'], 'shot_home_desktop'),
  (9,  'Finalize and UI Check', 'Check Homepage Mobile', ARRAY['Done'], 'shot_home_mobile'),
  (10, 'Finalize and UI Check', 'Check 3 other pages Desktop (Sampling)', ARRAY['Done'], 'shot_inner_desktop'),
  (11, 'Finalize and UI Check', 'Check 3 other pages Mobile (Sampling)', ARRAY['Done'], 'shot_inner_mobile'),
  (12, 'Finalize and UI Check', 'Check for Inspect and View Source on 3 Pages', ARRAY['Done'], NULL)
) AS v(pos, section, label, options, source)
WHERE NOT EXISTS (SELECT 1 FROM maintenance_template_items i WHERE i.template_id = t.id);

WITH t AS (SELECT id FROM maintenance_templates WHERE key = 'monthly')
INSERT INTO maintenance_template_items (template_id, pos, section, label, options, source)
SELECT t.id, v.pos, v.section, v.label, v.options, v.source FROM t, (VALUES
  (1,  'Plugin, Theme & Trash Check', 'Monthly backup', ARRAY['Done'], NULL),
  (2,  'Plugin, Theme & Trash Check', 'Update Plugins', ARRAY['All plugins are updated','Some plugins are not updated'], 'plugin_updates'),
  (3,  'Plugin, Theme & Trash Check', 'Check plugin error', ARRAY['No error found','Error found'], NULL),
  (4,  'Plugin, Theme & Trash Check', 'Check unnecessary plugins', ARRAY['Done'], NULL),
  (5,  'Plugin, Theme & Trash Check', 'Delete unnecessary themes', ARRAY['Done'], NULL),
  (6,  'Plugin, Theme & Trash Check', 'Check Recycle bin', ARRAY['Done'], NULL),
  (7,  'Plugin, Theme & Trash Check', 'Make sure notification on dashboard is zero if possible', ARRAY['Done'], NULL),
  (8,  'Security Check', 'Scan malware', ARRAY['No malware found','Malware found'], 'malware'),
  (9,  'Security Check', 'Block IP/Country IP that not related to the site business', ARRAY['Did not block any IP','Blocked IP'], NULL),
  (10, 'Security Check', 'Check and remove Spam comment', ARRAY['No spam found','Spam found and has been removed'], NULL),
  (11, 'Security Check', 'Check and remove Spam form', ARRAY['No spam found','Spam found and has been removed'], NULL),
  (12, 'Security Check', 'SSL Check & Fix', ARRAY['SSL is active','SSL problem'], 'ssl'),
  (13, 'Security Check', 'Check dummy user', ARRAY['Done'], NULL),
  (14, 'Security Check', 'Check email notification', ARRAY['Done','Problem found'], NULL),
  (15, 'Security Check', 'Uncheck the Gravatar if customer not used that', ARRAY['Done'], NULL),
  (16, 'Security Check', 'Google the website (Example: site:deskteam360.com)', ARRAY['Done'], NULL),
  (17, 'Security Check', 'Disable Code Execution for Uploads directory on Wordfence', ARRAY['Done'], NULL),
  (18, 'Security Check', 'DELETE the File Manager Plugin after use', ARRAY['Done'], NULL),
  (19, 'Performance', 'Check link error', ARRAY['No error found','Errors found'], 'broken_links'),
  (20, 'Performance', 'Page speed score', ARRAY['Done'], NULL),
  (21, 'Performance', 'Check all product image', ARRAY['All product has featured image','Some products have no image'], NULL),
  (22, 'Performance', 'Domain can be access with "www" or without "www"', ARRAY['Done','Problem found'], 'domain_www'),
  (23, 'Performance', 'Domain can be access with "S" or without "S"', ARRAY['Done','Problem found'], 'domain_https'),
  (24, 'Finalize and UI Check', 'Check Homepage Desktop', ARRAY['Done'], 'shot_home_desktop'),
  (25, 'Finalize and UI Check', 'Check Homepage Mobile', ARRAY['Done'], 'shot_home_mobile'),
  (26, 'Finalize and UI Check', 'Check 3 other pages Desktop (Sampling)', ARRAY['Done'], 'shot_inner_desktop'),
  (27, 'Finalize and UI Check', 'Check 3 other pages Mobile (Sampling)', ARRAY['Done'], 'shot_inner_mobile'),
  (28, 'Finalize and UI Check', 'Check for Inspect and View Source on 3 Pages', ARRAY['Done'], NULL),
  (29, 'Finalize and UI Check', 'Monthly backup - removed the current one', ARRAY['Done'], NULL)
) AS v(pos, section, label, options, source)
WHERE NOT EXISTS (SELECT 1 FROM maintenance_template_items i WHERE i.template_id = t.id);

ALTER TABLE maintenance_templates OWNER TO dtlabs;
ALTER TABLE maintenance_template_items OWNER TO dtlabs;
ALTER TABLE maintenance_reports OWNER TO dtlabs;
ALTER TABLE maintenance_report_items OWNER TO dtlabs;
