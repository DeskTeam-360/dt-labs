-- Track when ticket was last viewed (by anyone) - 1 read = no notification for all
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_tickets_last_read_at ON tickets(last_read_at);

-- Allow anyone who can read the ticket to mark it as read (update last_read_at only)
CREATE OR REPLACE FUNCTION public.mark_ticket_read(ticket_id_param INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tickets t WHERE t.id = ticket_id_param AND (
      (t.visibility = 'public') OR
      t.created_by = auth.uid() OR
      public.is_todo_assignee(t.id, auth.uid()) OR
      (t.visibility = 'team' AND t.team_id IS NOT NULL AND public.is_team_member(t.team_id, auth.uid())) OR
      (t.visibility = 'private' AND t.created_by = auth.uid()) OR
      (t.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND company_id = t.company_id))
    )
  ) THEN
    UPDATE tickets SET last_read_at = NOW(), updated_at = NOW() WHERE id = ticket_id_param;
  END IF;
END;
$$;

-- Grant execute to authenticated (customer/agent who can read can mark read)
GRANT EXECUTE ON FUNCTION public.mark_ticket_read(INTEGER) TO authenticated;
