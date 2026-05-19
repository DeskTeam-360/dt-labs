-- Ticket types: optionally hide type from customer portal / reference.

ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS is_agent_only boolean NOT NULL DEFAULT false;

