-- Calls per hour of an AI connection now follow the owner's role: agents 50, managers and operations 100, admins 200.
-- Connections still on the old default (100) are moved to their role's number; limits somebody set by hand are left alone.
-- Safe to run as postgres or as dtlabs, and safe to run again.

UPDATE api_keys k
SET rate_limit_per_hour = CASE lower(u.role)
  WHEN 'admin' THEN 200
  WHEN 'manager' THEN 100
  WHEN 'operations' THEN 100
  ELSE 50
END
FROM users u
WHERE u.id = k.user_id
  AND k.rate_limit_per_hour = 100;
