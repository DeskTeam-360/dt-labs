-- User sandi untuk catatan automation (memenuhi FK ticket_comments.user_id → users.id).
-- Samakan id dengan lib/automation-constants.ts AUTOMATION_NOTE_USER_ID
INSERT INTO public.users (id, email, full_name, role, status)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  'automation.internal@system',
  'Automation',
  'user',
  'active'
)
ON CONFLICT (id) DO NOTHING;
