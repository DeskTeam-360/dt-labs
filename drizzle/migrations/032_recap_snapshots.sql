-- Recap snapshots: saved aggregates from Customer time report (full month / full ISO week only).
CREATE TABLE recap_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(500) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type varchar(16) NOT NULL CHECK (period_type IN ('month', 'week')),
  team_ids jsonb NOT NULL,
  team_key text NOT NULL,
  payload jsonb NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX recap_snapshots_upsert_idx ON recap_snapshots (team_key, period_start, period_end, title);

CREATE INDEX recap_snapshots_period_idx ON recap_snapshots (period_start, period_end);

-- Same pattern as 030: mirror grantees from public.companies; fallback to PUBLIC for app DB user.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recap_snapshots TO PUBLIC;

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
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recap_snapshots TO PUBLIC;
      ELSE
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recap_snapshots TO %I',
          grantee_name
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'recap_snapshots: skipped GRANT for % (%).', grantee_name, SQLERRM;
    END;
  END LOOP;

  IF n = 0 THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recap_snapshots TO PUBLIC;
  END IF;
END $$;
