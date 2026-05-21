-- Migration 045 — Job types mirror grants for companies
-- Same pattern as 037_project_kanban_and_project_tickets.sql (project_statuses):
-- USAGE on public schema (like 044), GRANT explicitly to PUBLIC, then copy grantees from public.companies.

GRANT USAGE ON SCHEMA public TO PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_types TO PUBLIC;

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
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_types TO PUBLIC;
      ELSE
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_types TO %I',
          grantee_name
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'job_types GRANT skipped for % (%).', grantee_name, SQLERRM;
    END;
  END LOOP;

  IF n = 0 THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_types TO PUBLIC;
  END IF;
END $$;
