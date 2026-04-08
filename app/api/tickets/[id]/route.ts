import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  tickets,
  ticketAssignees,
  ticketTags,
  ticketAttachments,
  ticketChecklist,
  ticketComments,
  ticketAttributs,
  ticketPriorities,
  ticketTypes,
} from '@/lib/db'
import { runAutomationRules } from '@/lib/automation-engine'
import {
  diffTicketSnapshots,
  loadTicketActivitySnapshot,
  logTicketActivity,
} from '@/lib/ticket-activity-log'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { notifyTicketUsers, diffNewAssignees } from '@/lib/firebase/ticket-notifications-server'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { coerceTicketType, parseTicketType } from '@/lib/ticket-classification'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'

async function triggerTicketUpdatedAutomation(ticketId: number) {
  try {
    const [row] = await db
      .select({
        t: tickets,
        prioritySlug: ticketPriorities.slug,
        typeSlug: ticketTypes.slug,
      })
      .from(tickets)
      .leftJoin(ticketPriorities, eq(tickets.priorityId, ticketPriorities.id))
      .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
      .where(eq(tickets.id, ticketId))
      .limit(1)
    if (!row) return
    const assigneeRows = await db
      .select({ userId: ticketAssignees.userId })
      .from(ticketAssignees)
      .where(eq(ticketAssignees.ticketId, ticketId))
    await runAutomationRules('ticket_updated', {
      id: row.t.id,
      title: row.t.title,
      description: row.t.description,
      status: row.t.status,
      priority_slug: row.prioritySlug ?? null,
      type_slug: row.typeSlug ?? null,
      ticket_type: coerceTicketType(row.t.ticketType),
      company_id: row.t.companyId,
      created_via: row.t.createdVia,
      team_id: row.t.teamId,
      visibility: row.t.visibility,
      assignee_ids: assigneeRows.map((r) => r.userId),
    })
  } catch (err) {
    console.error('Automation rules error (ticket_updated):', err)
  }
}

/** PATCH /api/tickets/[id] - Update ticket (status, or full) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = await request.json()

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  const actorUserId = session.user.id!

  // Quick path: only status update (e.g. kanban drag)
  if (Object.keys(body).length === 1 && body.status !== undefined) {
    const [cur] = await db
      .select({ status: tickets.status })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)
    await db.update(tickets).set({ status: body.status, updatedAt: new Date() }).where(eq(tickets.id, ticketId))
    if (cur && cur.status !== body.status) {
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['status'],
          changes: { status: { from: cur.status, to: body.status } },
        },
      })
      try {
        const [meta] = await db
          .select({ title: tickets.title, createdBy: tickets.createdBy })
          .from(tickets)
          .where(eq(tickets.id, ticketId))
          .limit(1)
        const arows = await db
          .select({ userId: ticketAssignees.userId })
          .from(ticketAssignees)
          .where(eq(ticketAssignees.ticketId, ticketId))
        const recipients = [...arows.map((r) => r.userId), meta?.createdBy].filter(Boolean) as string[]
        const actorName =
          (session.user as { name?: string | null }).name ||
          session.user.email ||
          'Someone'
        await notifyTicketUsers({
          recipientUserIds: recipients,
          excludeUserId: actorUserId,
          ticketId,
          ticketTitle: meta?.title || 'Ticket',
          type: 'status_changed',
          title: 'Ticket status updated',
          body: `"${meta?.title || 'Ticket'}": ${cur.status} → ${body.status}`,
          actorUserId,
          actorName,
        })
      } catch (e) {
        console.error('[PATCH ticket status] notify:', e)
      }
      try {
        const [slackRow] = await db
          .select({
            id: tickets.id,
            title: tickets.title,
            status: tickets.status,
            teamId: tickets.teamId,
            priorityId: tickets.priorityId,
            companyId: tickets.companyId,
            typeId: tickets.typeId,
          })
          .from(tickets)
          .where(eq(tickets.id, ticketId))
          .limit(1)
        if (slackRow) {
          void notifySlackTicketEvent('status_changed', {
            id: slackRow.id,
            title: slackRow.title,
            status: slackRow.status,
            teamId: slackRow.teamId ?? null,
            priorityId: slackRow.priorityId ?? null,
            companyId: slackRow.companyId ?? null,
            typeId: slackRow.typeId ?? null,
            previousStatus: cur.status,
          })
        }
      } catch (e) {
        console.error('[PATCH ticket status] slack:', e)
      }
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true })
  }

  // Quick path: mark ticket as read (no automation - UI only)
  if (Object.keys(body).length === 1 && body.mark_read === true) {
    await db.update(tickets).set({ lastReadAt: new Date() }).where(eq(tickets.id, ticketId))
    return NextResponse.json({ ok: true })
  }

  // Quick path: ticket_type (support | spam | trash) — agents only
  if (Object.keys(body).length === 1 && body.ticket_type !== undefined) {
    if (role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const cls = parseTicketType(body.ticket_type)
    if (!cls) {
      return NextResponse.json({ error: 'Invalid ticket_type' }, { status: 400 })
    }
    const [cur] = await db
      .select({ ticketType: tickets.ticketType })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)
    await db
      .update(tickets)
      .set({ ticketType: cls, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
    if (cur && coerceTicketType(cur.ticketType) !== cls) {
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['ticket_type'],
          changes: { ticket_type: { from: coerceTicketType(cur.ticketType), to: cls } },
        },
      })
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true, ticket_type: cls })
  }

  // Quick path: description only (from detail page)
  if (body.description !== undefined && !body.title && !body.assignees && !body.tag_ids) {
    const [cur] = await db
      .select({ description: tickets.description })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)
    await db
      .update(tickets)
      .set({ description: body.description ?? null, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
    if (cur && String(cur.description ?? '') !== String(body.description ?? '')) {
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['description'],
          changes: { description: { from: cur.description, to: body.description ?? null } },
        },
      })
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true })
  }

  const {
    title,
    description,
    short_note,
    status,
    visibility,
    team_id,
    type_id,
    priority_id,
    company_id,
    due_date,
    assignees,
    tag_ids,
    ticket_type,
    attachments_add = [],
    attachments_delete = [],
  } = body

  const beforeSnapshot = await loadTicketActivitySnapshot(ticketId)

  let ticketTypeUpdate: string | undefined
  if (ticket_type !== undefined && actorRole !== 'customer') {
    const cls = parseTicketType(ticket_type)
    if (cls) ticketTypeUpdate = cls
  }

  const ticketUpdates: Record<string, unknown> = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(short_note !== undefined && { shortNote: short_note ?? null }),
    ...(status !== undefined && { status }),
    ...(visibility !== undefined && { visibility }),
    ...(team_id !== undefined && { teamId: team_id || null }),
    ...(type_id !== undefined && { typeId: type_id ?? null }),
    ...(priority_id !== undefined && { priorityId: priority_id ?? null }),
    ...(company_id !== undefined && { companyId: company_id || null }),
    ...(due_date !== undefined && { dueDate: due_date ? new Date(due_date) : null }),
    ...(ticketTypeUpdate !== undefined && { ticketType: ticketTypeUpdate }),
  }
  if (Object.keys(ticketUpdates).length > 0) {
    await db
      .update(tickets)
      .set({ ...ticketUpdates, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
  }

  if (assignees !== undefined) {
    await db.delete(ticketAssignees).where(eq(ticketAssignees.ticketId, ticketId))
    if (assignees.length > 0) {
      await db.insert(ticketAssignees).values(
        assignees.map((userId: string) => ({
          ticketId,
          userId,
        }))
      )
    }
  }

  if (tag_ids !== undefined) {
    await db.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId))
    if (tag_ids.length > 0) {
      await db.insert(ticketTags).values(
        tag_ids.map((tagId: string) => ({
          ticketId,
          tagId,
        }))
      )
    }
  }

  let attachmentsRemovedMeta: { id: string; file_name: string }[] = []
  if (attachments_delete?.length > 0) {
    const removedRows = await db
      .select({ id: ticketAttachments.id, fileName: ticketAttachments.fileName })
      .from(ticketAttachments)
      .where(
        and(eq(ticketAttachments.ticketId, ticketId), inArray(ticketAttachments.id, attachments_delete))
      )
    attachmentsRemovedMeta = removedRows.map((r) => ({ id: r.id, file_name: r.fileName }))
    await db.delete(ticketAttachments).where(inArray(ticketAttachments.id, attachments_delete))
  }

  if (attachments_add?.length > 0) {
    await db.insert(ticketAttachments).values(
      attachments_add.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        ticketId,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: session.user?.id,
      }))
    )
  }

  if (beforeSnapshot) {
    const afterSnapshot = await loadTicketActivitySnapshot(ticketId)
    if (afterSnapshot) {
      const changes = diffTicketSnapshots(beforeSnapshot, afterSnapshot)
      const meta: Record<string, unknown> = {}
      if (Object.keys(changes).length > 0) meta.changes = changes
      const changedKeys = Object.keys(changes)
      if (changedKeys.length > 0) meta.changed_keys = changedKeys
      if (attachments_add.length > 0) {
        meta.attachments_added = attachments_add.map((a: { file_name?: string }) => ({
          file_name: a.file_name ?? '',
        }))
      }
      if (attachmentsRemovedMeta.length > 0) meta.attachments_removed = attachmentsRemovedMeta
      if (Object.keys(meta).length > 0) {
        await logTicketActivity({
          ticketId,
          actorUserId,
          actorRole,
          action: 'ticket_updated',
          metadata: meta,
        })
      }

      const statusChange = changes.status as { from: unknown; to: unknown } | undefined
      if (
        statusChange &&
        statusChange.from !== statusChange.to &&
        afterSnapshot
      ) {
        void notifySlackTicketEvent('status_changed', {
          id: ticketId,
          title: afterSnapshot.title,
          status: afterSnapshot.status,
          teamId: afterSnapshot.teamId,
          priorityId: afterSnapshot.priorityId,
          companyId: afterSnapshot.companyId,
          typeId: afterSnapshot.typeId,
          previousStatus: String(statusChange.from),
        })
      }

      const assigneeChange = changes.assignee_ids as { from: unknown; to: unknown } | undefined
      if (
        assigneeChange &&
        Array.isArray(assigneeChange.from) &&
        Array.isArray(assigneeChange.to)
      ) {
        const added = diffNewAssignees(assigneeChange.from as string[], assigneeChange.to as string[])
        if (added.length > 0) {
          try {
            const actorName =
              (session.user as { name?: string | null }).name ||
              session.user.email ||
              'Someone'
            await notifyTicketUsers({
              recipientUserIds: added,
              excludeUserId: actorUserId,
              ticketId,
              ticketTitle: afterSnapshot.title,
              type: 'assignee_added',
              title: 'You were assigned',
              body: `Added as assignee on "${afterSnapshot.title}"`,
              actorUserId,
              actorName,
            })
          } catch (e) {
            console.error('[PATCH ticket assignees] notify:', e)
          }
        }
      }
    }
  }

  await triggerTicketUpdatedAutomation(ticketId)
  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}

/** DELETE /api/tickets/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const delRole = (session.user as { role?: string }).role?.toLowerCase()
  const delActorRole: TicketActorRole = delRole === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id!,
    actorRole: delActorRole,
    action: 'ticket_deleted',
    metadata: { ticket_ref: ticketId },
  })

  await db.delete(ticketAssignees).where(eq(ticketAssignees.ticketId, ticketId))
  await db.delete(ticketChecklist).where(eq(ticketChecklist.ticketId, ticketId))
  await db.delete(ticketComments).where(eq(ticketComments.ticketId, ticketId))
  await db.delete(ticketAttributs).where(eq(ticketAttributs.ticketId, ticketId))
  await db.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId))
  await db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, ticketId))
  await db.delete(tickets).where(eq(tickets.id, ticketId))

  return NextResponse.json({ ok: true })
}
