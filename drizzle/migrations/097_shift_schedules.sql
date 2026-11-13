-- Shift schedule: put people on a shift for a period (start date to end date, WIB calendar days).
-- One row per person per period. When a period starts, the person's current shift (users.shift_id) is set to it;
-- they stay on it until the next period that covers them starts (so a rotation is just one period after another).
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS shift_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  applied_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_schedules_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS shift_schedules_user_idx ON shift_schedules (user_id, start_date);
CREATE INDEX IF NOT EXISTS shift_schedules_due_idx ON shift_schedules (start_date) WHERE applied_at IS NULL;

ALTER TABLE shift_schedules OWNER TO dtlabs;
