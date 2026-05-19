-- Project core: id, title, description. Drop checklist; rename name → title if still present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.projects RENAME COLUMN name TO title;
  END IF;
END $$;

ALTER TABLE public.projects DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.projects DROP COLUMN IF EXISTS created_by;

DROP TABLE IF EXISTS public.project_checklist;
