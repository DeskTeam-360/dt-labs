-- Separate last-read timestamps for customer vs staff/agent audiences.
-- Opening a ticket as one audience must not clear the unread indicator for the other.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS customer_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_last_read_at timestamptz;

-- Seed from the legacy shared last_read_at so existing read state is preserved.
UPDATE tickets
SET customer_last_read_at = COALESCE(customer_last_read_at, last_read_at)
WHERE last_read_at IS NOT NULL;

UPDATE tickets
SET staff_last_read_at = COALESCE(staff_last_read_at, last_read_at)
WHERE last_read_at IS NOT NULL;
