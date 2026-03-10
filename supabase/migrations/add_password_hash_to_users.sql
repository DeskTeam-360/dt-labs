-- Add password_hash for NextAuth Credentials (email/password login)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
