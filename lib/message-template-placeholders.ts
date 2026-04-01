/**
 * Placeholders for message templates: `{{ key }}` stored as literal text in HTML;
 * replaced at send/render time using recipient + sender users + ticket context.
 *
 * `recipient.*` and `sender.*` mirror the `users` table (snake_case).
 * Do not document password_hash / permissions / metadata.
 */

export type MessageTemplatePlaceholderDef = {
  /** Token inside {{ ... }} */
  key: string
  /** Short explanation for editors */
  description: string
}

/** Prefix for recipient merge keys (the user the message is sent to). */
export const MESSAGE_TEMPLATE_RECIPIENT_PREFIX = 'recipient.'

/** Prefix for sender merge keys (the acting / sending user, e.g. agent who posted). */
export const MESSAGE_TEMPLATE_SENDER_PREFIX = 'sender.'

function r(field: string): string {
  return `${MESSAGE_TEMPLATE_RECIPIENT_PREFIX}${field}`
}

function s(field: string): string {
  return `${MESSAGE_TEMPLATE_SENDER_PREFIX}${field}`
}

export const MESSAGE_TEMPLATE_RECIPIENT_PLACEHOLDERS: MessageTemplatePlaceholderDef[] = [
  { key: r('first_name'), description: 'Recipient given name' },
  { key: r('last_name'), description: 'Recipient family name' },
  { key: r('full_name'), description: 'Recipient display name' },
  { key: r('email'), description: 'Recipient email address' },
  { key: r('user_id'), description: 'Recipient user UUID' },
  { key: r('avatar_url'), description: 'Recipient profile image URL (if any)' },
  { key: r('role'), description: 'Recipient app role (e.g. admin, staff)' },
  { key: r('status'), description: 'Recipient account status (users.status)' },
  { key: r('phone'), description: 'Recipient phone' },
  { key: r('department'), description: 'Recipient department' },
  { key: r('position'), description: 'Recipient job title / position' },
  { key: r('bio'), description: 'Recipient bio' },
  { key: r('timezone'), description: 'Recipient timezone' },
  { key: r('locale'), description: 'Recipient locale' },
  { key: r('is_email_verified'), description: 'Recipient email verified flag' },
  { key: r('company_id'), description: 'Recipient company UUID (if linked)' },
  { key: r('last_login_at'), description: 'Recipient last login (formatted when merged)' },
  { key: r('last_active_at'), description: 'Recipient last activity (formatted when merged)' },
  { key: r('created_at'), description: 'Recipient user row created at (formatted when merged)' },
  { key: r('updated_at'), description: 'Recipient user row updated at (formatted when merged)' },
]

/** Sender = acting user (e.g. agent who triggered the email); same shape as recipient. */
export const MESSAGE_TEMPLATE_SENDER_PLACEHOLDERS: MessageTemplatePlaceholderDef[] = [
  { key: s('first_name'), description: 'Sender given name' },
  { key: s('last_name'), description: 'Sender family name' },
  { key: s('full_name'), description: 'Sender display name' },
  { key: s('email'), description: 'Sender email address' },
  { key: s('user_id'), description: 'Sender user UUID' },
  { key: s('avatar_url'), description: 'Sender profile image URL (if any)' },
  { key: s('role'), description: 'Sender app role (e.g. admin, staff)' },
  { key: s('status'), description: 'Sender account status (users.status)' },
  { key: s('phone'), description: 'Sender phone' },
  { key: s('department'), description: 'Sender department' },
  { key: s('position'), description: 'Sender job title / position' },
  { key: s('bio'), description: 'Sender bio' },
  { key: s('timezone'), description: 'Sender timezone' },
  { key: s('locale'), description: 'Sender locale' },
  { key: s('is_email_verified'), description: 'Sender email verified flag' },
  { key: s('company_id'), description: 'Sender company UUID (if linked)' },
  { key: s('last_login_at'), description: 'Sender last login (formatted when merged)' },
  { key: s('last_active_at'), description: 'Sender last activity (formatted when merged)' },
  { key: s('created_at'), description: 'Sender user row created at (formatted when merged)' },
  { key: s('updated_at'), description: 'Sender user row updated at (formatted when merged)' },
]

/** Ticket context (when a ticket exists for the notification). */
export const MESSAGE_TEMPLATE_TICKET_PLACEHOLDERS: MessageTemplatePlaceholderDef[] = [
  {
    key: 'ticket',
    description: 'Label e.g. "Ticket #123" — rendered as a link to the ticket in HTML email / rich UI',
  },
  { key: 'ticket_id', description: 'Numeric ticket id only' },
  {
    key: 'ticket_link',
    description: 'Absolute URL to open the ticket in the app (plain text or href at merge time)',
  },
]

export function wrapPlaceholderKey(key: string): string {
  return `{{ ${key} }}`
}

/** All keys for validation / replacement order (recipient, sender, ticket). */
export function allMessageTemplatePlaceholderKeys(): string[] {
  return [
    ...MESSAGE_TEMPLATE_RECIPIENT_PLACEHOLDERS.map((p) => p.key),
    ...MESSAGE_TEMPLATE_SENDER_PLACEHOLDERS.map((p) => p.key),
    ...MESSAGE_TEMPLATE_TICKET_PLACEHOLDERS.map((p) => p.key),
  ]
}
