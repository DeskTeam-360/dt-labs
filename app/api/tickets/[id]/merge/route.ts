import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { commentAttachments, db, ticketAttachments, ticketComments, tickets, users } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { compactCompanySupportPriorities } from '@/lib/ticket-company-priority-order'

const MAX_SECONDARY = 20

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

/**
 * POST /api/tickets/[id]/merge   body: { secondary_ids: number[] }
 * [id] is the primary ticket. For every secondary ticket the description and all comments are copied onto the
 * primary as internal notes (attachments linked, not re-uploaded) and the secondary is marked as
 * "Part of #primary" and closed (leaving the company support queue). Nothing is deleted, and merging cannot be undone.
 * If a secondary already has merged tickets of its own, those are re-pointed to the new primary.
 * Allowed for admin, manager and staff.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const actorId = session.user.id
  const actorName = session.user.name || session.user.email || 'An agent'

  const { id } = await params
  const primaryId = parseInt(id, 10)
  if (Number.isNaN(primaryId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as { secondary_ids?: unknown } | null
  const secondaryIds = [
    ...new Set(
      (Array.isArray(body?.secondary_ids) ? body!.secondary_ids : [])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0 && n !== primaryId)
    ),
  ]
  if (secondaryIds.length === 0) return NextResponse.json({ error: 'Pick at least one ticket to merge' }, { status: 400 })
  if (secondaryIds.length > MAX_SECONDARY) {
    return NextResponse.json({ error: `You can merge at most ${MAX_SECONDARY} tickets at once` }, { status: 400 })
  }

  const [primary] = await db.select().from(tickets).where(eq(tickets.id, primaryId)).limit(1)
  if (!primary) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (primary.mergedIntoTicketId) {
    return NextResponse.json(
      { error: `This ticket is already part of #${primary.mergedIntoTicketId}. Merge into that ticket instead.` },
      { status: 400 }
    )
  }

  const secondaries = await db.select().from(tickets).where(inArray(tickets.id, secondaryIds))
  if (secondaries.length !== secondaryIds.length) {
    return NextResponse.json({ error: 'One or more tickets were not found' }, { status: 404 })
  }
  const alreadyMerged = secondaries.filter((s) => s.mergedIntoTicketId)
  if (alreadyMerged.length > 0) {
    return NextResponse.json(
      { error: `Already merged: ${alreadyMerged.map((s) => `#${s.id}`).join(', ')}` },
      { status: 400 }
    )
  }
  // Authors for the "original author" line
  const comments = await db
    .select()
    .from(ticketComments)
    .where(inArray(ticketComments.ticketId, secondaryIds))
    .orderBy(asc(ticketComments.createdAt))
  const commentIds = comments.map((c) => c.id)
  const [descAtt, commentAtt] = await Promise.all([
    db.select().from(ticketAttachments).where(inArray(ticketAttachments.ticketId, secondaryIds)),
    commentIds.length
      ? db.select().from(commentAttachments).where(inArray(commentAttachments.commentId, commentIds))
      : Promise.resolve([]),
  ])
  const userIds = [
    ...new Set([
      ...comments.map((c) => c.userId),
      ...secondaries.map((s) => s.createdBy).filter((u): u is string => Boolean(u)),
    ]),
  ]
  const userRows = userIds.length
    ? await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(inArray(users.id, userIds))
    : []
  const nameOf = new Map(userRows.map((u) => [u.id, u.fullName || u.email]))

  const base = Date.now()
  let tick = 0
  const nextTime = () => new Date(base + tick++)

  await db.transaction(async (tx) => {
    const insertNote = async (ticketId: number, html: string): Promise<string> => {
      const [row] = await tx
        .insert(ticketComments)
        .values({
          ticketId,
          userId: actorId,
          comment: html,
          visibility: 'note',
          authorType: 'agent',
          createdAt: nextTime(),
        })
        .returning({ id: ticketComments.id })
      return row.id
    }

    for (const s of secondaries) {
      const link = `<a href="/tickets/${s.id}" target="_blank" rel="noopener noreferrer">#${s.id}</a>`
      const head = (label: string, who: string | null | undefined, when: Date | string | null | undefined) =>
        `<p><strong>Merged from ${link} — ${esc(s.title)}</strong><br><em>${label}${who ? ` · ${esc(who)}` : ''}${when ? ` · ${esc(fmtDate(when))}` : ''}</em></p>`

      // Description
      const descNoteId = await insertNote(
        primaryId,
        `${head('Description', s.createdBy ? nameOf.get(s.createdBy) : null, s.createdAt)}${s.description ?? ''}`
      )
      const myDescAtt = descAtt.filter((a) => a.ticketId === s.id)
      if (myDescAtt.length > 0) {
        await tx.insert(commentAttachments).values(
          myDescAtt.map((a) => ({
            commentId: descNoteId,
            fileUrl: a.fileUrl,
            fileName: a.fileName,
            // Empty path: deleting this copy must never remove the file the original still uses.
            filePath: '',
            uploadedBy: actorId,
          }))
        )
      }

      // Comments, oldest first
      for (const c of comments.filter((x) => x.ticketId === s.id)) {
        const label = c.visibility === 'note' ? 'Note' : 'Reply'
        const noteId = await insertNote(
          primaryId,
          `${head(label, nameOf.get(c.userId), c.createdAt)}${c.comment ?? ''}`
        )
        const atts = commentAtt.filter((a) => a.commentId === c.id)
        if (atts.length > 0) {
          await tx.insert(commentAttachments).values(
            atts.map((a) => ({
              commentId: noteId,
              fileUrl: a.fileUrl,
              fileName: a.fileName,
              filePath: '',
              uploadedBy: actorId,
            }))
          )
        }
      }

      // Mark the secondary
      await insertNote(
        s.id,
        `<p><strong>Merged into <a href="/tickets/${primaryId}" target="_blank" rel="noopener noreferrer">#${primaryId}</a></strong> — ${esc(primary.title)}<br><em>by ${esc(actorName)}</em></p>`
      )
      // The secondary is closed; a closed support ticket leaves the company queue (priority cleared).
      await tx
        .update(tickets)
        .set({
          mergedIntoTicketId: primaryId,
          ...(s.status !== 'closed' && { status: 'closed', priority: null }),
          updatedAt: new Date(),
        })
        .where(and(eq(tickets.id, s.id)))
    }

    // Close the gaps the closed secondaries left in their company queues.
    const queueCompanies = new Set(
      secondaries
        .filter((s) => s.status !== 'closed' && s.ticketType === 'support' && s.companyId)
        .map((s) => s.companyId as string)
    )
    for (const companyId of queueCompanies) {
      await compactCompanySupportPriorities(tx, companyId)
    }

    // A secondary that was itself a primary: its earlier merged tickets now belong to the new primary.
    await tx
      .update(tickets)
      .set({ mergedIntoTicketId: primaryId })
      .where(inArray(tickets.mergedIntoTicketId, secondaryIds))
  })

  await logTicketActivity({
    ticketId: primaryId,
    actorUserId: actorId,
    actorRole: 'agent',
    action: 'ticket_merged',
    metadata: { role: 'primary', merged_ids: secondaryIds },
  })
  for (const s of secondaries) {
    await logTicketActivity({
      ticketId: s.id,
      actorUserId: actorId,
      actorRole: 'agent',
      action: 'ticket_merged',
      metadata: { role: 'secondary', primary_id: primaryId },
    })
    if (s.status !== 'closed') {
      await logTicketActivity({
        ticketId: s.id,
        actorUserId: actorId,
        actorRole: 'agent',
        action: 'ticket_updated',
        metadata: { changed_keys: ['status'], changes: { status: { from: s.status, to: 'closed' } } },
      })
    }
    bumpTicketDataVersion(s.id)
  }
  bumpTicketDataVersion(primaryId)

  return NextResponse.json({ ok: true, primary_id: primaryId, merged_ids: secondaryIds })
}
