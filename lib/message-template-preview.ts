import { allMessageTemplatePlaceholderKeys } from '@/lib/message-template-placeholders'

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

/** Normalize HTML from the editor so `{{ ... }}` tokens match reliably. */
function normalizeMergeSource(html: string): string {
  return String(html)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/&#(?:x7B|123);/gi, '{')
    .replace(/&#(?:x7D|125);/gi, '}')
    .replace(/&#123;/gi, '{')
    .replace(/&#125;/gi, '}')
    .replace(/&lcub;/gi, '{')
    .replace(/&rcub;/gi, '}')
    .replace(/&lbrace;/gi, '{')
    .replace(/&rbrace;/gi, '}')
    .replace(/\uff5b/g, '{')
    .replace(/\uff5d/g, '}')
}

/** Merge adjacent text nodes so split `{{` / `token` / `}}` can match in one regex pass. */
function mergeAdjacentTextNodesDeep(el: Element) {
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]
    if (c.nodeType === Node.ELEMENT_NODE) mergeAdjacentTextNodesDeep(c as Element)
  }
  let merged = true
  while (merged) {
    merged = false
    let child = el.firstChild
    while (child) {
      const next = child.nextSibling
      if (child.nodeType === Node.TEXT_NODE && next?.nodeType === Node.TEXT_NODE) {
        ;(child as Text).appendData((next as Text).data)
        next.remove()
        merged = true
        continue
      }
      child = next
    }
  }
}

type ReplaceContext = {
  officialKeys: Set<string>
  replaceOfficialKey: (key: string) => string | null
  replaceBareRecipient: (key: string) => string | null
}

/**
 * Replace `{{ ... }}` in the HTML *string* so real `<a>` tags parse as elements (not text).
 * Do not assign HTML snippets to Text nodes — that shows literal `<a...>` on screen.
 */
function applyPlaceholderReplacements(html: string, ctx: ReplaceContext): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/gi, (full, rawKey: string) => {
    const key = rawKey.trim().toLowerCase()
    if (!key) return full
    if (ctx.officialKeys.has(key)) {
      const v = ctx.replaceOfficialKey(key)
      return v !== null ? v : full
    }
    const bare = ctx.replaceBareRecipient(key)
    return bare !== null ? bare : full
  })
}

function makeContext(origin: string, tid: string) {
  const ticketUrl = `${origin}/tickets/${tid}`
  const officialKeys = new Set(allMessageTemplatePlaceholderKeys().map((k) => k.toLowerCase()))

  const replaceOfficialKey = (key: string): string | null => {
    if (key === 'ticket_id') return tid
    if (key === 'ticket_link') return ticketUrl
    if (key === 'ticket') {
      const safe = ticketUrl
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">Ticket #${tid}</a>`
    }
    if (key.startsWith('recipient.')) {
      const field = key.slice('recipient.'.length)
      return RECIPIENT_SAMPLE[field] ?? null
    }
    if (key.startsWith('sender.')) {
      const field = key.slice('sender.'.length)
      return SENDER_SAMPLE[field] ?? null
    }
    return null
  }

  const replaceBareRecipient = (key: string): string | null => {
    if (key.includes('.')) return null
    if (Object.prototype.hasOwnProperty.call(RECIPIENT_SAMPLE, key)) return RECIPIENT_SAMPLE[key]!
    return null
  }

  return { officialKeys, replaceOfficialKey, replaceBareRecipient }
}

/**
 * Replace known `{{ key }}` tokens with sample data so editors can preview layout.
 * Adjacent text nodes are merged first (Quill); replacements run on HTML so links are real elements.
 */
export function previewMessageTemplateHtml(html: string, options?: MessageTemplatePreviewOptions): string {
  if (html == null || !String(html).trim()) return ''

  const origin = (options?.origin ?? 'https://example.com').replace(/\/$/, '')
  const tid = options?.sampleTicketId ?? MESSAGE_TEMPLATE_PREVIEW_SAMPLE_TICKET_ID
  const ctx = makeContext(origin, tid)

  let working = normalizeMergeSource(html)

  if (typeof document !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(working, 'text/html')
      mergeAdjacentTextNodesDeep(doc.body)
      working = doc.body.innerHTML
    } catch {
      // keep working as-is
    }
  }

  return applyPlaceholderReplacements(working, ctx)
}
