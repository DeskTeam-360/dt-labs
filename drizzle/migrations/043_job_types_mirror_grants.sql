-- Siap jalankan PostgreSQL (tanpa dollar-quote / blok DO).
-- Hak baca untuk katalog job_types — USAGE pada schema public diperlukan sebelum SELECT mempan.
-- Jika Anda sudah menjalankan ini dan masih tolak akses, jalankan migrasi 044 juga.

GRANT USAGE ON SCHEMA public TO PUBLIC;

GRANT SELECT ON TABLE public.job_types TO PUBLIC;
