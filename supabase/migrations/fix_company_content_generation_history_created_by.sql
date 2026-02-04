-- Remove FK to auth.users so insert never fails due to auth schema permission.
-- created_by remains UUID; we still store user id, just without FK constraint.
ALTER TABLE company_content_generation_history
  DROP CONSTRAINT IF EXISTS company_content_generation_history_created_by_fkey;
