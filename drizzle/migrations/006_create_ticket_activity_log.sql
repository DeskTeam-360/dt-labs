-- Ticket activity audit log (create / update / delete / comments / automation).
-- Run: psql "$DATABASE_URL" -f drizzle/migrations/006_create_ticket_activity_log.sql

CREATE TABLE IF NOT EXISTS public.ticket_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id INTEGER REFERENCES public.tickets(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role VARCHAR(32) NOT NULL DEFAULT 'agent',
  action VARCHAR(64) NOT NULL,
  metadata JSONB,
  related_comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_activity_log_ticket_id_created_at_idx
  ON public.ticket_activity_log (ticket_id, created_at DESC);

COMMENT ON TABLE public.ticket_activity_log IS 'Append-only ticket lifecycle and comment activity; ticket_id nulled if ticket deleted.';
