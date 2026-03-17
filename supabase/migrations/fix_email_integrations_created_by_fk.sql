-- Remove FK to auth.users so insert never fails when using NextAuth (users table) instead of Supabase Auth.
-- created_by remains UUID; we still store user id, just without FK constraint.
-- Same fix as fix_company_content_generation_history_created_by.sql
ALTER TABLE email_integrations
  DROP CONSTRAINT IF EXISTS email_integrations_created_by_fkey;
