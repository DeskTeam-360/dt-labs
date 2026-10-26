import { and, desc, eq, gte, ilike, inArray, lte, or, type SQL,sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketNotifications } from '@/lib/db'

const MAX_PAGE_SIZE = 100

/**
 * GET /api/notifications/list - the logged-in user's own notifications, with filters and paging.
 * Query: page, page_size, status=unread|read, types=a,b, actor=<user id>, from, to (ISO), q (text or ticket number).
 * Returns { items, total, unread_total, actors } where actors = people who triggered at least one notification.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = String(session.user.id).trim()

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('page_size') ?? '25', 10) || 25))
  const status = url.searchParams.get('status')
  const types = (url.searchParams.get('types') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const actor = url.searchParams.get('actor')?.trim()
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const q = url.searchParams.get('q')?.trim()

  const conds: SQL[] = [eq(ticketNotifications.userId, uid)]
  if (status === 'unread') conds.push(eq(ticketNotifications.read, false))
  if (status === 'read') conds.push(eq(ticketNotifications.read, true))
  if (types.length > 0) conds.push(inArray(ticketNotifications.type, types))
  if (actor) conds.push(eq(ticketNotifications.actorUserId, actor))
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null
  if (fromDate && !Number.isNaN(fromDate.getTime())) conds.push(gte(ticketNotifications.createdAt, fromDate))
  if (toDate && !Number.isNaN(toDate.getTime())) conds.push(lte(ticketNotifications.createdAt, toDate))
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`
    const asId = /^#?\d+$/.test(q) ? parseInt(q.replace('#', ''), 10) : null
    const parts: SQL[] = [
      ilike(ticketNotifications.ticketTitle, pattern),
      ilike(ticketNotifications.title, pattern),
      ilike(ticketNotifications.body, pattern),
    ]
    if (asId != null && asId <= 2147483647) parts.push(eq(ticketNotifications.ticketId, asId))
    conds.push(or(...parts)!)
  }
  const where = and(...conds)

  try {
    const [rows, [{ total }], [{ unread }], actorRows] = await Promise.all([
      db
        .select()
        .from(ticketNotifications)
        .where(where)
        .orderBy(desc(ticketNotifications.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(ticketNotifications).where(where),
      db
        .select({ unread: sql<number>`count(*)::int` })
        .from(ticketNotifications)
        .where(and(eq(ticketNotifications.userId, uid), eq(ticketNotifications.read, false))),
      db
        .selectDistinct({ id: ticketNotifications.actorUserId, name: ticketNotifications.actorName })
        .from(ticketNotifications)
        .where(eq(ticketNotifications.userId, uid))
        .limit(300),
    ])

    // One entry per person (the name can differ between rows of the same person).
    const actors = new Map<string, string>()
    for (const a of actorRows) if (a.id && !actors.has(a.id)) actors.set(a.id, a.name || 'Someone')

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        ticketTitle: r.ticketTitle,
        type: r.type,
        title: r.title,
        body: r.body,
        read: r.read,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        actorUserId: r.actorUserId ?? '',
        actorName: r.actorName,
      })),
      total,
      unread_total: unread,
      actors: [...actors.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch {
    return NextResponse.json({ items: [], total: 0, unread_total: 0, actors: [], error: 'fetch_failed' })
  }
}
