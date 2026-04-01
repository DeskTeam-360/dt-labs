/** Stable keys seeded in `message_templates` — use in code / automation (not the human title). */
export const MESSAGE_TEMPLATE_KEYS = [
  'agent_notification_new_ticket_created',
  'agent_notification_ticket_assigned_team',
  'agent_notification_ticket_assigned_agent',
  'agent_notification_requester_replies',
  'agent_notification_ticket_unattended_group',
  'agent_notification_first_response_sla_violation',
  'agent_notification_resolution_sla_violation',
  'agent_notification_note_added',
  'agent_notification_first_response_sla_reminder',
  'agent_notification_resolution_sla_reminder',
  'requester_notification_new_ticket_created',
  'requester_notification_agent_comment',
  'requester_notification_agent_solves',
  'requester_notification_agent_closes',
  'requester_notification_user_activation',
  'requester_notification_password_reset',
  'requester_notification_cc',
  'requester_notification_new_ticket_alt',
  'requester_notification_note_added',
  'template_agent_reply',
  'template_agent_forward',
] as const

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number]
