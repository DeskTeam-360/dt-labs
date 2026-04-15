import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { ticketStatuses } from '@/lib/db'
import { ensureTicketStatusIsDeletableColumn } from '@/lib/ensure-ticket-status-is-deletable'
import { isTicketStatusInKanban } from '@/lib/ticket-status-kanban'

/** GET /api/ticket-statuses - List all ticket statuses */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureTicketStatusIsDeletableColumn()

  const rows = await db
    .select()
    .from(ticketStatuses)
    .orderBy(asc(ticketStatuses.sortOrder))

  const data = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    customer_title: r.customerTitle ?? undefined,
    description: r.description ?? undefined,
    color: r.color,
    show_in_kanban: isTicketStatusInKanban(r.showInKanban),
    is_deletable: r.isDeletable,
    is_active: r.isActive,
    sort_order: r.sortOrder ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/ticket-statuses - Create ticket status */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, slug, customer_title, description, color, show_in_kanban, sort_order, is_deletable, is_active } =
    body

  if (!title || !slug) {
    return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
  }

  await ensureTicketStatusIsDeletableColumn()

  const [inserted] = await db
    .insert(ticketStatuses)
    .values({
      title: String(title).trim(),
      slug: String(slug).trim().toLowerCase().replace(/\s+/g, '_'),
      customerTitle: customer_title?.trim() || null,
      description: description?.trim() || '',
      color: color || '#8c8c8c',
      showInKanban: !!show_in_kanban,
      isDeletable: is_deletable !== false,
      isActive: is_active !== false,
      sortOrder: Number(sort_order) ?? 0,
    })
    .returning()

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({
    id: inserted.id,
    slug: inserted.slug,
    title: inserted.title,
    customer_title: inserted.customerTitle ?? undefined,
    description: inserted.description ?? undefined,
    color: inserted.color,
    show_in_kanban: isTicketStatusInKanban(inserted.showInKanban),
    is_deletable: inserted.isDeletable,
    is_active: inserted.isActive,
    sort_order: inserted.sortOrder ?? 0,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
