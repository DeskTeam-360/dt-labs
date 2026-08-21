-- Allow selecting multiple days of the month for specific_date frequency.
-- Existing single integers (e.g. 15) become JSON arrays (e.g. [15]).
ALTER TABLE recurring_tickets
  ALTER COLUMN specific_date TYPE JSONB
  USING CASE
    WHEN specific_date IS NULL THEN NULL
    ELSE jsonb_build_array(specific_date)
  END;
