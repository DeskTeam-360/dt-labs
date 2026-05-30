-- Track who completed a checklist item, when, and optional note
ALTER TABLE public.ticket_checklist
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_note text;
