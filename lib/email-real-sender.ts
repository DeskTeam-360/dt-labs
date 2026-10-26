const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi

/** Sender addresses that belong to a service, not to a person. */
const SERVICE_LOCALPART = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|notify|mailer|mailer-daemon|alerts?|bounces?|system|automated)/i

function firstEmail(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(EMAIL_RE)
  return m && m.length > 0 ? m[0].toLowerCase() : null
}

export type RealSender = { email: string; domain: string }

/**
 * Mail sent through a service (Airtable, Jotform, Google Docs ...) comes from the service's own address, e.g.
 * "jason@provencontent.com via Airtable" <noreply@airtable.com>. The person who really wrote it is in the
 * Reply-To header, or as an email address inside the display name. Returns null for ordinary mail.
 *
 * Only mail that looks like it came through a service is treated this way: a no-reply style address, or a display
 * name written as "... via <service>".
 */
export function detectRealSender(opts: { from: string; replyTo?: string | null }): RealSender | null {
  const fromAddress = firstEmail(opts.from.match(/<([^>]+)>/)?.[1] ?? opts.from)
  if (!fromAddress) return null
  const displayName = opts.from.match(/^([^<]+)</)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''

  const localPart = fromAddress.split('@')[0] ?? ''
  const viaService = /\bvia\b/i.test(displayName)
  if (!SERVICE_LOCALPART.test(localPart) && !viaService) return null

  const candidates = [firstEmail(opts.replyTo), firstEmail(displayName)]
  const real = candidates.find((e): e is string => Boolean(e) && e !== fromAddress && !SERVICE_LOCALPART.test((e as string).split('@')[0] ?? ''))
  if (!real) return null
  return { email: real, domain: real.split('@')[1] ?? '' }
}
