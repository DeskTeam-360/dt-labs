import { asc, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessEmailIntegration } from '@/lib/auth-utils'
import { db, emailSkipList } from '@/lib/db'

async function requireAccess() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessEmailIntegration((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** GET /api/email/skip-list — senders whose emails sync ignores. */
export async function GET() {
  const denied = await requireAccess()
  if (denied) return denied
  const rows = await db.select().from(emailSkipList).orderBy(asc(emailSkipList.email))
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      reason: r.reason,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    }))
  )
}

/** POST /api/email/skip-list — { email, reason? } */
export async function POST(request: Request) {
  const denied = await requireAccess()
  if (denied) return denied
  const body = await request.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null

  const [existing] = await db
    .select({ id: emailSkipList.id })
    .from(emailSkipList)
    .where(sql`lower(${emailSkipList.email}) = ${email}`)
    .limit(1)
  if (existing) return NextResponse.json({ error: 'This email is already blocked' }, { status: 409 })

  const [row] = await db.insert(emailSkipList).values({ email, reason }).returning()
  return NextResponse.json({ id: row.id, email: row.email, reason: row.reason })
}
