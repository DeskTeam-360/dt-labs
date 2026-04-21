-- Allow arbitrary date ranges for recap_snapshots (not only full month / full ISO week).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'recap_snapshots'
      AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%period_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.recap_snapshots DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.recap_snapshots
  ADD CONSTRAINT recap_snapshots_period_type_check
  CHECK (period_type IN ('month', 'week', 'custom'));
