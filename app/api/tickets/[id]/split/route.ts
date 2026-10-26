import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { commentAttachments, db, ticketAttachments, ticketComments, tickets } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { applyDefaultSkillsToTicket } from '@/lib/skills'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { assignCompanySupportTicketRank, assignCreatorSupportTicketRank } from '@/lib/ticket-company-priority-order'

/**
 * POST /api/tickets/[id]/split { comment_id, title? }
 * Makes a new ticket out of one reply (usually a customer reply that is really a new request).
 * - The reply STAYS on this ticket and is marked "Split to #N" (a link).
 * - The new ticket starts clean: the reply text is its description, the reply's files are linked to it, and it has no
 *   comments. It is written by the same person and keeps this ticket's company, team and type.
 * - No email is sent to anyone (tickets are not created through the email flow).
 * Admin, manager and staff.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actorId = session.user.id

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
  if (comment.authorType === 'automation') return NextResponse.json({ error: 'An automation note cannot be split' }, { status: 400 })
  if (comment.splitToTicketId) {
    return NextResponse.json({ error: `This reply was already split to #${comment.splitToTicketId}` }, { status: 409 })
  }

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

    // The new ticket goes to the end of its queue.
    if (source.companyId) await assignCompanySupportTicketRank(tx, source.companyId, newId, 'append')
    else await assignCreatorSupportTicketRank(tx, comment.userId, newId, 'append')

    // Linked copies of the files. The empty path means deleting one copy never removes the stored file the other uses.
    if (files.length > 0) {
      await tx.insert(ticketAttachments).values(
        files.map((f) => ({ ticketId: newId, fileUrl: f.fileUrl, fileName: f.fileName, filePath: '', uploadedBy: f.uploadedBy }))
      )
    }

    // The reply stays where it is; it is only marked.
    await tx.update(ticketComments).set({ splitToTicketId: newId }).where(eq(ticketComments.id, commentId))
  })

  await logTicketActivity({ ticketId: sourceId, actorUserId: actorId, actorRole: 'agent', action: 'ticket_split', metadata: { role: 'source', other_id: newId, title } })
  await logTicketActivity({ ticketId: newId, actorUserId: actorId, actorRole: 'agent', action: 'ticket_split', metadata: { role: 'new', other_id: sourceId } })

  // Same start as any new ticket (default skills, "ticket created" rules). Automation rules never send email.
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
