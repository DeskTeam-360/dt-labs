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
import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

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

  // Quick path: only status update (e.g. kanban drag)
  if (Object.keys(body).length === 1 && body.status !== undefined) {
    await db.update(tickets).set({ status: body.status, updatedAt: new Date() }).where(eq(tickets.id, ticketId))
    await triggerTicketUpdatedAutomation(ticketId)
    return NextResponse.json({ ok: true })
  }

  // Quick path: mark ticket as read (no automation - UI only)
  if (Object.keys(body).length === 1 && body.mark_read === true) {
    await db.update(tickets).set({ lastReadAt: new Date() }).where(eq(tickets.id, ticketId))
    return NextResponse.json({ ok: true })
  }

  // Quick path: description only (from detail page)
  if (body.description !== undefined && !body.title && !body.assignees && !body.tag_ids) {
    await db
      .update(tickets)
      .set({ description: body.description ?? null, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
    await triggerTicketUpdatedAutomation(ticketId)
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
    attachments_add = [],
    attachments_delete = [],
  } = body

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

  if (attachments_delete?.length > 0) {
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

  await triggerTicketUpdatedAutomation(ticketId)
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

  await db.delete(ticketAssignees).where(eq(ticketAssignees.ticketId, ticketId))
  await db.delete(ticketChecklist).where(eq(ticketChecklist.ticketId, ticketId))
  await db.delete(ticketComments).where(eq(ticketComments.ticketId, ticketId))
  await db.delete(ticketAttributs).where(eq(ticketAttributs.ticketId, ticketId))
  await db.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId))
  await db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, ticketId))
  await db.delete(tickets).where(eq(tickets.id, ticketId))

  return NextResponse.json({ ok: true })
}
