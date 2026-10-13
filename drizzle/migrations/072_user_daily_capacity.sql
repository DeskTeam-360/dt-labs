-- Team capacity: first/last working day per user, daily capacity per user, holidays.
-- Run as the application DB user (dtlabs) so the app owns the new tables.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS joined_at date,
  ADD COLUMN IF NOT EXISTS left_at date;

CREATE TABLE IF NOT EXISTS user_daily_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capacity_date date NOT NULL,
  hours numeric(4,2) NOT NULL DEFAULT 8,
  reason varchar(16) NOT NULL DEFAULT 'work',
  source varchar(8) NOT NULL DEFAULT 'auto',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_daily_capacity_user_id_capacity_date_key UNIQUE (user_id, capacity_date)
);
CREATE INDEX IF NOT EXISTS user_daily_capacity_date_idx ON user_daily_capacity (capacity_date);

CREATE TABLE IF NOT EXISTS holidays (
  holiday_date date PRIMARY KEY,
  name varchar(255) NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
