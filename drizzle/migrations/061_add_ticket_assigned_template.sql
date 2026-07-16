INSERT INTO message_templates (id, type, template_group, title, key, status, email_subject, content)
VALUES (
  gen_random_uuid(),
  'email',
  'agent_notifications',
  'Agent Notification: Ticket Assigned',
  'agent_notification_ticket_assigned_agent',
  'active',
  'You have been assigned to Ticket #{{ ticket_id }}',
  '<p>Hello {{ recipient.full_name }},</p>
<p>You have been assigned to the following ticket by {{ sender.full_name }}:</p>
<p>{{ ticket }}</p>
<p><a href="{{ ticket_link }}">View Ticket</a></p>'
)
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE key = 'agent_notification_ticket_assigned_agent');
