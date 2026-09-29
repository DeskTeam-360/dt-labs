-- Customers can see tickets of extra companies only when an admin grants it explicitly.
-- Rows auto-created by email sync (CC recipients) keep ticket_access = false, so nobody gains access retroactively.
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS ticket_access boolean NOT NULL DEFAULT false;
