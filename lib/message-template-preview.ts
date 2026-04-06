import { mergeMessageTemplateHtml } from '@/lib/message-template-merge'

/** Default ticket id shown in template preview (`ticket`, `ticket_link`, etc.). */
export const MESSAGE_TEMPLATE_PREVIEW_SAMPLE_TICKET_ID = '777'

/** Sample `users`-shaped values for preview (not real data). */
const RECIPIENT_SAMPLE: Record<string, string> = {
  first_name: 'John',
  last_name: 'Recipient',
  full_name: 'John Recipient',
  email: 'john.recipient@example.com',
  user_id: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
  avatar_url: 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
  role: 'customer',
  status: 'active',
  phone: '+1 555 010 0101',
  department: '—',
  position: '—',
  bio: '—',
  timezone: 'America/New_York',
  locale: 'en',
  is_email_verified: 'true',
  company_id: 'bbbbbbbb-cccc-dddd-eeee-222222222222',
  last_login_at: 'Mar 28, 2026, 09:15',
  last_active_at: 'Apr 1, 2026, 14:22',
  created_at: 'Jan 10, 2026, 08:00',
  updated_at: 'Apr 1, 2026, 11:30',
}

const SENDER_SAMPLE: Record<string, string> = {
  first_name: 'John',
  last_name: 'Sender',
  full_name: 'John Sender',
  email: 'john.sender@example.com',
  user_id: 'cccccccc-dddd-eeee-ffff-333333333333',
  avatar_url: 'https://www.gravatar.com/avatar/11111111111111111111111111111111?d=mp&f=y',
  role: 'staff',
  status: 'active',
  phone: '+1 555 020 0202',
  department: 'Support',
  position: 'Agent',
  bio: 'Happy to help.',
  timezone: 'America/New_York',
  locale: 'en',
  is_email_verified: 'true',
  company_id: '—',
  last_login_at: 'Apr 1, 2026, 08:00',
  last_active_at: 'Apr 1, 2026, 14:25',
  created_at: 'Jun 1, 2025, 10:00',
  updated_at: 'Apr 1, 2026, 09:00',
}

export type MessageTemplatePreviewOptions = {
  /** App origin, no trailing slash — used for `ticket_link` and `ticket` href. */
  origin?: string
  /** Defaults to {@link MESSAGE_TEMPLATE_PREVIEW_SAMPLE_TICKET_ID}. */
  sampleTicketId?: string
}

/**
 * Replace known `{{ key }}` tokens with sample data so editors can preview layout.
 */
export function previewMessageTemplateHtml(html: string, options?: MessageTemplatePreviewOptions): string {
  const origin = (options?.origin ?? 'https://example.com').replace(/\/$/, '')
  const tid = options?.sampleTicketId ?? MESSAGE_TEMPLATE_PREVIEW_SAMPLE_TICKET_ID
  return mergeMessageTemplateHtml(html, {
    origin,
    ticketId: tid,
    recipient: RECIPIENT_SAMPLE,
    sender: SENDER_SAMPLE,
    useDomMerge: true,
  })
}
