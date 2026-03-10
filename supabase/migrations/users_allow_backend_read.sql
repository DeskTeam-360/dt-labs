-- Allow postgres/backend connection to read users (for NextAuth login)
-- Needed when connecting via DATABASE_URL without Supabase Auth session
CREATE POLICY "Backend can read users for login"
  ON users FOR SELECT
  TO postgres
  USING (true);
