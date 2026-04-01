-- Message / email templates for auto-response & notifications (admin edit only; seeded keys).
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(64) NOT NULL,
  template_group VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  key VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_templates_template_group_idx ON message_templates (template_group);
CREATE INDEX IF NOT EXISTS message_templates_type_idx ON message_templates (type);

INSERT INTO message_templates (type, template_group, title, key, status, content)
VALUES
-- Agent Notification
('agent_notification', 'Agent Notification', 'New Ticket Created', 'agent_notification_new_ticket_created', 'active', NULL),
('agent_notification', 'Agent Notification', 'Ticket Assigned to Team', 'agent_notification_ticket_assigned_team', 'active', NULL),
('agent_notification', 'Agent Notification', 'Ticket Assigned to Agent', 'agent_notification_ticket_assigned_agent', 'active', NULL),
('agent_notification', 'Agent Notification', 'Requester Replies to Ticket', 'agent_notification_requester_replies', 'active', NULL),
('agent_notification', 'Agent Notification', 'Ticket Unattended in Group', 'agent_notification_ticket_unattended_group', 'active', NULL),
('agent_notification', 'Agent Notification', 'First Response SLA Violation', 'agent_notification_first_response_sla_violation', 'active', NULL),
('agent_notification', 'Agent Notification', 'Resolution Time SLA Violation', 'agent_notification_resolution_sla_violation', 'active', NULL),
('agent_notification', 'Agent Notification', 'Note added to ticket', 'agent_notification_note_added', 'active', NULL),
('agent_notification', 'Agent Notification', 'First Response SLA Reminder', 'agent_notification_first_response_sla_reminder', 'active', NULL),
('agent_notification', 'Agent Notification', 'Resolution Time SLA Reminder', 'agent_notification_resolution_sla_reminder', 'active', NULL),
-- Requester Notification
('requester_notification', 'Requester Notification', 'New Ticket Created', 'requester_notification_new_ticket_created', 'active', NULL),
('requester_notification', 'Requester Notification', 'Agent Adds Comment to Ticket', 'requester_notification_agent_comment', 'active', NULL),
('requester_notification', 'Requester Notification', 'Agent Solves the Ticket', 'requester_notification_agent_solves', 'active', NULL),
('requester_notification', 'Requester Notification', 'Agent Closes the Ticket', 'requester_notification_agent_closes', 'active', NULL),
('requester_notification', 'Requester Notification', 'User Activation Email', 'requester_notification_user_activation', 'active', NULL),
('requester_notification', 'Requester Notification', 'Password Reset Email', 'requester_notification_password_reset', 'active', NULL),
('requester_notification', 'Requester Notification', 'CC Notification', 'requester_notification_cc', 'active', NULL),
('requester_notification', 'Requester Notification', 'New Ticket Created (alternate)', 'requester_notification_new_ticket_alt', 'active', NULL),
('requester_notification', 'Requester Notification', 'Note added to ticket', 'requester_notification_note_added', 'active', NULL),
-- Reply / forward composer templates
('reply_template', 'Templates', 'Agent Reply Template', 'template_agent_reply', 'active', NULL),
('reply_template', 'Templates', 'Agent Forward Template', 'template_agent_forward', 'active', NULL)
ON CONFLICT (key) DO NOTHING;
