-- Hak schema public sering dibutuhkan sebelum SELECT ke tabel (tanpa ini: "permission denied for table job_types").
GRANT USAGE ON SCHEMA public TO PUBLIC;

GRANT SELECT ON TABLE public.job_types TO PUBLIC;
