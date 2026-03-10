-- Seed admin user (password: admin123)
-- Jalankan di Supabase SQL Editor
-- Jika user sudah ada (dari Supabase Auth), password_hash akan di-update
INSERT INTO users (id, email, password_hash, full_name, role, status)
VALUES (
  gen_random_uuid(),
  'admin@example.com',
  '$2b$10$GeYiiGKo2DAczSZEmTYQLO86NB8Uaof7qxpNB0V6EzpS0ZA1FsTwS',
  'Admin',
  'admin',
  'active'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  status = EXCLUDED.status;
