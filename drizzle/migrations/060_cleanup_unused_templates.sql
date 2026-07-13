DELETE FROM message_templates WHERE key IN (
  'requester_notification_agent_comment',
  'requester_notification_agent_solves',
  'requester_notification_new_ticket_alt',
  'requester_notification_note_added',
  'requester_notification_cc',
  'template_agent_forward',
  'agent_notification_first_response_sla_reminder',
  'agent_notification_first_response_sla_violation',
  'agent_notification_resolution_sla_reminder',
  'agent_notification_resolution_sla_violation',
  'agent_notification_ticket_assigned_agent',
  'agent_notification_ticket_assigned_team',
  'agent_notification_ticket_unattended_group'
);
