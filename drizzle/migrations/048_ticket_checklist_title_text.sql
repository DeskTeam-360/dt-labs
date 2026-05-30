-- Allow long AI-generated checklist / task titles (was varchar(255))
ALTER TABLE public.ticket_checklist
  ALTER COLUMN title TYPE text;
