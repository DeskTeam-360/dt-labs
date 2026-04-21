-- Materialized customer × ISO week cells per team (Recap Customer Weekly).
-- Populated by cron or POST /api/reports/customer-weekly-recap/materialize.

CREATE TABLE customer_weekly_recap_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  iso_year smallint NOT NULL,
  iso_week smallint NOT NULL,
  is_embedded boolean NOT NULL DEFAULT false,
  client_time_hours integer NOT NULL DEFAULT 0,
  tracker_reported_seconds bigint NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_weekly_recap_cells_team_company_week_uid UNIQUE (team_id, company_id, week_start)
);

CREATE INDEX customer_weekly_recap_cells_team_week_idx ON customer_weekly_recap_cells (team_id, week_start DESC);
CREATE INDEX customer_weekly_recap_cells_company_idx ON customer_weekly_recap_cells (company_id);

-- Same pattern as 032 recap_snapshots: mirror grantees from public.companies; fallback PUBLIC.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_weekly_recap_cells TO PUBLIC;

DO $$
DECLARE
  grantee_name text;
  n int := 0;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT g.grantee::text
    FROM information_schema.role_table_grants AS g
    WHERE g.table_schema = 'public'
      AND g.table_name = 'companies'
  LOOP
    n := n + 1;
    BEGIN
      IF grantee_name = 'PUBLIC' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_weekly_recap_cells TO PUBLIC;
      ELSE
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_weekly_recap_cells TO %I',
          grantee_name
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'customer_weekly_recap_cells: skipped GRANT for % (%).', grantee_name, SQLERRM;
    END;
  END LOOP;

  IF n = 0 THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_weekly_recap_cells TO PUBLIC;
  END IF;
END $$;
