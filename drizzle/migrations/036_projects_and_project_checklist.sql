-- Projects + checklist items (internal, non-customer) + link screenshots.project_id → projects

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name varchar(255) NOT NULL,
  description text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  is_completed boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS project_checklist_project_id_idx ON public.project_checklist(project_id);

ALTER TABLE public.screenshots DROP CONSTRAINT IF EXISTS screenshots_project_id_fkey;

ALTER TABLE public.screenshots
  ADD CONSTRAINT screenshots_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_checklist TO PUBLIC;

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
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO PUBLIC;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_checklist TO PUBLIC;
      ELSE
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO %I',
          grantee_name
        );
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_checklist TO %I',
          grantee_name
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'projects GRANT skipped for % (%).', grantee_name, SQLERRM;
    END;
  END LOOP;

  IF n = 0 THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO PUBLIC;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_checklist TO PUBLIC;
  END IF;
END $$;
