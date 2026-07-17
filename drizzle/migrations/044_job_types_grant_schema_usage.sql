-- Public schema USAGE is often required before SELECT on tables (without this: "permission denied for table job_types").
GRANT USAGE ON SCHEMA public TO PUBLIC;

GRANT SELECT ON TABLE public.job_types TO PUBLIC;
