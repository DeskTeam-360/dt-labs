-- Allow multiple saved filter presets (drop singleton id = 1 constraint; use sequence for new rows).
ALTER TABLE customer_time_report_defaults ADD COLUMN IF NOT EXISTS title varchar(200) NOT NULL DEFAULT 'Saved filter';

ALTER TABLE customer_time_report_defaults DROP CONSTRAINT IF EXISTS customer_time_report_defaults_id_check;

ALTER TABLE customer_time_report_defaults ALTER COLUMN id DROP DEFAULT;

CREATE SEQUENCE IF NOT EXISTS customer_time_report_defaults_id_seq;

DO $$
DECLARE mx int;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO mx FROM customer_time_report_defaults;
  IF mx = 0 THEN
    PERFORM setval('customer_time_report_defaults_id_seq', 1, false);
  ELSE
    PERFORM setval('customer_time_report_defaults_id_seq', mx, true);
  END IF;
END $$;

ALTER TABLE customer_time_report_defaults
  ALTER COLUMN id SET DEFAULT nextval('customer_time_report_defaults_id_seq');

-- OWNED BY requires sequence and table to share the same owner (often wrong if sequence was created as postgres).
DO $$
DECLARE
  tbl_owner name;
BEGIN
  SELECT r.rolname INTO tbl_owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_roles r ON r.oid = c.relowner
  WHERE c.relname = 'customer_time_report_defaults'
    AND n.nspname = 'public'
    AND c.relkind = 'r'
  LIMIT 1;
  IF tbl_owner IS NOT NULL THEN
    EXECUTE format(
      'ALTER SEQUENCE public.customer_time_report_defaults_id_seq OWNER TO %I',
      tbl_owner
    );
  END IF;
END $$;

ALTER SEQUENCE public.customer_time_report_defaults_id_seq OWNED BY public.customer_time_report_defaults.id;
