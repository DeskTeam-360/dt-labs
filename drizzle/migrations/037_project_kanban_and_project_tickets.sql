-- Per-project Kanban statuses, tickets scoped to projects (ticket_type = 'project'), optional checklist→ticket link

CREATE TABLE IF NOT EXISTS public.project_statuses (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title varchar(100) NOT NULL,
  slug varchar(50) NOT NULL,
  color varchar(20) NOT NULL DEFAULT '#d9d9d9',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS project_statuses_project_id_idx ON public.project_statuses(project_id);

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS project_status_id integer REFERENCES public.project_statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tickets_project_id_idx ON public.tickets(project_id);

ALTER TABLE public.project_checklist
  ADD COLUMN IF NOT EXISTS ticket_id integer REFERENCES public.tickets(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_checklist_project_ticket_unique
  ON public.project_checklist (project_id, ticket_id)
  WHERE ticket_id IS NOT NULL;

INSERT INTO public.project_statuses (project_id, title, slug, color, sort_order)
SELECT p.id, v.title, v.slug, v.color, v.sort_order
FROM public.projects p
CROSS JOIN (
  VALUES
    ('Backlog', 'backlog', '#F1C232', 0),
    ('In progress', 'in_progress', '#1890ff', 1),
    ('Done', 'done', '#52c41a', 2)
) AS v(title, slug, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.project_statuses ps WHERE ps.project_id = p.id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_statuses TO PUBLIC;

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
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_statuses TO PUBLIC;
      ELSE
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_statuses TO %I',
          grantee_name
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'project_statuses GRANT skipped for % (%).', grantee_name, SQLERRM;
    END;
  END LOOP;

  IF n = 0 THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_statuses TO PUBLIC;
  END IF;
END $$;
