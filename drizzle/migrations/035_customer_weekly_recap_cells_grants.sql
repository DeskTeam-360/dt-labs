-- App DB role(s) need table privileges (same pattern as 032 recap_snapshots / 030 company_daily_active_assignments).

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
