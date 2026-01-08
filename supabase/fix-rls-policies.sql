-- Fix RLS Policies for users table
-- Run this in Supabase SQL Editor

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Service role full access" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Authenticated users can read all" ON users;
DROP POLICY IF EXISTS "Authenticated users can update all" ON users;

-- Policy 1: Users can read their own data
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Authenticated users can read all users (for admin panel)
-- Remove this if you want stricter access control
CREATE POLICY "Authenticated users can read all"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Policy 3: Users can insert their own data (when they sign up)
CREATE POLICY "Users can insert own data"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy 4: Users can update their own data
CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 5: Allow trigger function to insert (SECURITY DEFINER bypasses RLS)
-- This is handled by the trigger function using SECURITY DEFINER
-- But we also need a policy for manual inserts

-- Policy 6: Allow authenticated users to update any user (for admin operations)
-- You can restrict this to admin role only if needed
CREATE POLICY "Authenticated users can update all"
  ON users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy 7: Allow authenticated users to delete (optional, for admin)
-- Uncomment if you want to allow delete operations
-- CREATE POLICY "Authenticated users can delete"
--   ON users FOR DELETE
--   TO authenticated
--   USING (true);

-- Note: The trigger function handle_new_user() uses SECURITY DEFINER
-- which bypasses RLS, so it can insert even without policies.
-- But manual inserts from the application need the policies above.



