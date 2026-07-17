-- Recurring ticket created notification (Requester Notification group)
INSERT INTO message_templates (id, type, template_group, title, key, status, email_subject, content)
SELECT
  gen_random_uuid(),
  'requester_notification',
  'Requester Notification',
  'Recurring Ticket Created',
  'requester_notification_recurring_ticket_created',
  'active',
  'Recurring ticket #{{ ticket_id }} has been created',
  '<p>Hello {{ recipient.full_name }},</p>
<p>A scheduled recurring ticket has been created for {{ recipient.company_name }}.</p>
<p><strong>Ticket #{{ ticket_id }}</strong></p>
<p>{{ ticket }}</p>
<p><a href="{{ ticket_link }}">View Ticket</a></p>'
WHERE NOT EXISTS (
  SELECT 1 FROM message_templates WHERE key = 'requester_notification_recurring_ticket_created'
);
