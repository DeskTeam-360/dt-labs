-- Allow inserting users without auth.users (for NextAuth Credentials seeder)
-- Drop FK so seed can insert users with gen_random_uuid() as id
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Default id for direct inserts (optional)
ALTER TABLE users
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
