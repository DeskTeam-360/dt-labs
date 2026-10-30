import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { siteUrl, ticketVisibility } from '@/lib/api-v1'
import { runTicketCommentAutomation } from '@/lib/automation-engine'
import { db, ticketComments, tickets } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { sendNoteAddedNotificationEmail } from '@/lib/ticket-notification-emails'

const MAX_TEXT = 20000

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain text in, safe HTML out: blank lines make paragraphs, single line breaks stay. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * POST /api/v1/tickets/{id}/notes - an internal note (only the team sees it; the customer is never emailed).
 * The note is written as the key's owner and always marked "via API" with the assistant's name (`via`, required),
 * which is also added as a closing line to the text so everyone reading the ticket can tell.
 * Replying to customers is deliberately not offered through the API.
 */
export async function addApiNote(request: Request, rawId: string) {
  const me = await getApiUser(request, 'notes:write')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ticketId = Number(rawId.replace(/^#/, ''))
  if (!Number.isInteger(ticketId) || ticketId <= 0) return NextResponse.json({ error: 'Invalid ticket number' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as { text?: unknown; via?: unknown } | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send a JSON body with text and via' }, { status: 400 })

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required (plain text)' }, { status: 400 })
  if (text.length > MAX_TEXT) return NextResponse.json({ error: `text is too long (max ${MAX_TEXT} characters)` }, { status: 400 })
   
  const via = typeof body.via === 'string' ? body.via.replace(/[\u0000-\u001f<>]/g, '').trim() : ''
  if (via.length < 2 || via.length > 60) {
    return NextResponse.json({ error: 'via is required: the name of the AI assistant writing this, for example "Claude" or "ChatGPT" (2 to 60 characters)' }, { status: 400 })
  }

  const visible = await ticketVisibility(me)
  const [t] = await db
    .select({ id: tickets.id, title: tickets.title })
    .from(tickets)
    .where(visible ? and(eq(tickets.id, ticketId), eq(tickets.ticketType, 'support'), visible) : and(eq(tickets.id, ticketId), eq(tickets.ticketType, 'support')))
    .limit(1)
  if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const html = `${textToHtml(text)}<p><em>Added via ${escapeHtml(via)} (API)</em></p>`
  const [row] = await db
    .insert(ticketComments)
    .values({ ticketId, userId: me.id, comment: html, visibility: 'note', authorType: 'agent', source: 'api', sourceLabel: via })
    .returning({ id: ticketComments.id, createdAt: ticketComments.createdAt })
  if (!row) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })

  await logTicketActivity({
    ticketId,
    actorUserId: me.id,
    actorRole: 'agent',
    action: 'comment_added',
    relatedCommentId: row.id,
    metadata: { visibility: 'note', author_type: 'agent', source: 'api', via, body_preview: text.replace(/\s+/g, ' ').slice(0, 200) },
  })

  // The note is saved at this point; what follows (automations, the team's notification) must not undo it.
  try {
    await runTicketCommentAutomation(ticketId, { visibility: 'note', authorType: 'agent' })
  } catch (e) {
    console.error('[api notes] automation:', e)
  }
  try {
    await sendNoteAddedNotificationEmail({ ticketId, ticketTitle: t.title, notePreview: text.replace(/\s+/g, ' ').slice(0, 300), noteHtml: html, actorUserId: me.id })
  } catch (e) {
    console.error('[api notes] notify:', e)
  }
  bumpTicketDataVersion(ticketId)

  return NextResponse.json(
    {
      id: row.id,
      ticket_id: ticketId,
      type: 'note',
      via,
      text,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      url: `${siteUrl()}/tickets/${ticketId}`,
    },
    { status: 201 }
  )
}
