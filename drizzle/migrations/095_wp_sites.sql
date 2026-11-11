-- WordPress monitoring: registered sites (with their signing key) and the reports the plugin sends.
-- Safe to run as postgres or as dtlabs, and safe to run again: the new tables are handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS wp_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url text NOT NULL UNIQUE,
  name varchar(255),
  -- A site stays when its company is removed; it just no longer points at one.
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  secret_key text NOT NULL,
  wp_version varchar(50),
  php_version varchar(50),
  last_report jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wp_site_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Removing a site removes its report history.
  site_id uuid NOT NULL REFERENCES wp_sites(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_site_reports_site_created_idx ON wp_site_reports (site_id, created_at);
-- The dashboard and Company, Websites look sites up per company.
CREATE INDEX IF NOT EXISTS wp_sites_company_idx ON wp_sites (company_id);

-- The app connects as dtlabs, so it must own the tables it writes to.
ALTER TABLE wp_sites OWNER TO dtlabs;
ALTER TABLE wp_site_reports OWNER TO dtlabs;
