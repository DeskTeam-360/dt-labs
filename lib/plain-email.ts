import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { getGmailSender, sendRawEmail } from '@/lib/ticket-notification-emails'

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

/** A system email (alerts, digests) to one team member, sent from the connected mailbox. False when nothing could be sent. */
export async function sendHtmlEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const [sender, settings] = await Promise.all([getGmailSender(), getAppSettings()])
    if (!sender) return false
    await sendRawEmail(sender, to, subject, html, formatFromHeader(settings.email_sender_name, sender.fromEmail))
    return true
  } catch (e) {
    console.error('[plain-email] could not send to', to, e)
    return false
  }
}
