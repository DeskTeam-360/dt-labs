import { count,eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { tickets,ticketStatuses } from '@/lib/db'
import { isTicketStatusInKanban } from '@/lib/ticket-status-kanban'
import { isLockedTicketStatusSlug } from '@/lib/ticket-status-locked-slugs'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** PATCH /api/ticket-statuses/[id] - Update ticket status */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const statusId = parseInt(id, 10)
  if (isNaN(statusId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json()
  const {
    title,
    slug,
    customer_title,
    description,
    color,
    show_in_kanban,
    sort_order,
    is_deletable,
    is_active,
  } = body

  const [current] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.id, statusId)).limit(1)
  if (!current) {
    return NextResponse.json({ error: 'Status not found' }, { status: 404 })
  }

  const values: Record<string, unknown> = {}
  if (title !== undefined) values.title = String(title).trim()
  if (slug !== undefined) values.slug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (customer_title !== undefined) values.customerTitle = customer_title?.trim() || null
  if (description !== undefined) values.description = description?.trim() || ''
  if (color !== undefined) values.color = color || '#8c8c8c'
  if (show_in_kanban !== undefined) values.showInKanban = !!show_in_kanban
  if (sort_order !== undefined) values.sortOrder = Number(sort_order) ?? 0
  if (is_deletable !== undefined && !isLockedTicketStatusSlug(current.slug)) {
    values.isDeletable = !!is_deletable
  }
  if (is_active !== undefined) {
    values.isActive = !!is_active
  }

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(ticketStatuses)
    .set(values as typeof ticketStatuses.$inferInsert)
    .where(eq(ticketStatuses.id, statusId))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Status not found' }, { status: 404 })
  }

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    title: updated.title,
    customer_title: updated.customerTitle ?? undefined,
    description: updated.description ?? undefined,
    color: updated.color,
    show_in_kanban: isTicketStatusInKanban(updated.showInKanban),
    is_deletable: updated.isDeletable,
    is_active: updated.isActive,
    sort_order: updated.sortOrder ?? 0,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/ticket-statuses/[id] - Delete ticket status */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const statusId = parseInt(id, 10)
  if (isNaN(statusId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    // First, get the status to check its slug
    const status = await db.query.ticketStatuses.findFirst({
      where: eq(ticketStatuses.id, statusId),
    })

    if (!status) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    if (isLockedTicketStatusSlug(status.slug) || !status.isDeletable) {
      return NextResponse.json({ error: 'This status cannot be deleted.' }, { status: 403 })
    }

    // Check if any tickets use this status
    const [result] = await db
      .select({ count: count() })
      .from(tickets)
      .where(eq(tickets.status, status.slug))

    if (result && result.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete: this status is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }

    // Delete the status
    const [deleted] = await db
      .delete(ticketStatuses)
      .where(eq(ticketStatuses.id, statusId))
      .returning({ id: ticketStatuses.id })

    if (!deleted) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    revalidateTicketsLookupCatalog()
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return NextResponse.json(
        { error: 'Cannot delete: this status is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }
    console.error('[DELETE ticket-statuses]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
