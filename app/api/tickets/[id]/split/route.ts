import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { commentAttachments, db, ticketAttachments, ticketComments, tickets } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { applyDefaultSkillsToTicket } from '@/lib/skills'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { assignCompanySupportTicketRank, assignCreatorSupportTicketRank } from '@/lib/ticket-company-priority-order'

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * POST /api/tickets/[id]/split { comment_id, title? }
 * Moves one comment (a reply that is really a new request) out of this ticket into a new ticket: its text becomes the
 * description, its files move along, and it is written by the same person. A note on each ticket links the two.
 * Admin, manager and staff.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actorId = session.user.id
  const actorName = session.user.name || session.user.email || 'An agent'

  const sourceId = parseInt((await params).id, 10)
  if (Number.isNaN(sourceId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as { comment_id?: unknown; title?: unknown }
  const commentId = typeof body.comment_id === 'string' ? body.comment_id : ''
  if (!commentId) return NextResponse.json({ error: 'comment_id required' }, { status: 400 })

  const [source] = await db.select().from(tickets).where(eq(tickets.id, sourceId)).limit(1)
  if (!source) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  const [comment] = await db
    .select()
    .from(ticketComments)
    .where(and(eq(ticketComments.id, commentId), eq(ticketComments.ticketId, sourceId)))
    .limit(1)
  if (!comment) return NextResponse.json({ error: 'Comment not found on this ticket' }, { status: 404 })

  const plain = comment.comment.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
  const requested = typeof body.title === 'string' ? body.title.trim().slice(0, 255) : ''
  const title = requested || (plain ? plain.slice(0, 120) : `Split from #${sourceId}`)

  const files = await db.select().from(commentAttachments).where(eq(commentAttachments.commentId, commentId))

  let newId = 0
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tickets)
      .values({
        title,
        description: comment.comment,
        status: 'open',
        visibility: source.visibility,
        teamId: source.teamId,
        typeId: source.typeId,
        companyId: source.companyId,
        createdBy: comment.userId,
        ticketType: 'support',
        createdVia: 'split',
        priority: null,
        createdAt: comment.createdAt,
      })
      .returning({ id: tickets.id })
    newId = row.id

    // New ticket goes to the end of its queue.
    if (source.companyId) await assignCompanySupportTicketRank(tx, source.companyId, newId, 'append')
    else await assignCreatorSupportTicketRank(tx, comment.userId, newId, 'append')

    // The files move with the text (same stored file, now owned by the new ticket).
    if (files.length > 0) {
      await tx.insert(ticketAttachments).values(
        files.map((f) => ({ ticketId: newId, fileUrl: f.fileUrl, fileName: f.fileName, filePath: f.filePath, uploadedBy: f.uploadedBy }))
      )
      await tx.delete(commentAttachments).where(eq(commentAttachments.commentId, commentId))
    }
    await tx.delete(ticketComments).where(eq(ticketComments.id, commentId))

    const link = (id: number) => `<a href="/tickets/${id}" target="_blank" rel="noopener noreferrer">#${id}</a>`
    await tx.insert(ticketComments).values([
      {
        ticketId: sourceId,
        userId: actorId,
        comment: `<p><strong>Split into ${link(newId)}</strong> — ${esc(title)}<br><em>by ${esc(actorName)}. The reply and its files moved to the new ticket.</em></p>`,
        visibility: 'note',
        authorType: 'agent',
      },
      {
        ticketId: newId,
        userId: actorId,
        comment: `<p><strong>Split from ${link(sourceId)}</strong> — ${esc(source.title)}<br><em>by ${esc(actorName)}</em></p>`,
        visibility: 'note',
        authorType: 'agent',
      },
    ])
  })

  await logTicketActivity({ ticketId: sourceId, actorUserId: actorId, actorRole: 'agent', action: 'ticket_split', metadata: { role: 'source', other_id: newId, title } })
  await logTicketActivity({ ticketId: newId, actorUserId: actorId, actorRole: 'agent', action: 'ticket_split', metadata: { role: 'new', other_id: sourceId } })

  // Same start as any new ticket: default skills, then the "ticket created" rules.
  try {
    await applyDefaultSkillsToTicket(newId, source.companyId, source.typeId)
  } catch (e) {
    console.error('[split] default skills failed:', (e as Error)?.message)
  }
  try {
    const ctx = await loadAutomationTicketContext(newId)
    if (ctx) await runAutomationRules('ticket_created', ctx)
  } catch (e) {
    console.error('[split] automation failed:', (e as Error)?.message)
  }

  bumpTicketDataVersion(sourceId)
  bumpTicketDataVersion(newId)
  return NextResponse.json({ ok: true, new_ticket_id: newId })
}
