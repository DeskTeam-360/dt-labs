import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketSavedFilters } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_PER_USER = 10

const toJson = (r: typeof ticketSavedFilters.$inferSelect) => ({ id: r.id, name: r.name, query: r.query, isDefault: r.isDefault })

/** GET /api/ticket-filters -> { filters: [{ id, name, query, isDefault }] } for the signed-in person. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.select().from(ticketSavedFilters).where(eq(ticketSavedFilters.userId, session.user.id)).orderBy(asc(ticketSavedFilters.createdAt))
  return NextResponse.json({ filters: rows.map(toJson) })
}

/** POST /api/ticket-filters { name, query } - saves a view (max 10 per person). */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; query?: unknown }
  const name = String(body.name ?? '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const query = String(body.query ?? '').trim().replace(/^\?/, '').slice(0, 4000)
  const existing = await db.select({ id: ticketSavedFilters.id }).from(ticketSavedFilters).where(eq(ticketSavedFilters.userId, session.user.id))
  if (existing.length >= MAX_PER_USER) return NextResponse.json({ error: `You can save up to ${MAX_PER_USER} views` }, { status: 400 })
  const [row] = await db.insert(ticketSavedFilters).values({ userId: session.user.id, name, query }).returning()
  return NextResponse.json({ filter: toJson(row) }, { status: 201 })
}
