import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessEmailIntegration } from '@/lib/auth-utils'
import { db, emailSkipList } from '@/lib/db'

/** DELETE /api/email/skip-list/[id] — unblock a sender (future emails sync again; past ones are not re-fetched). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessEmailIntegration((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const deleted = await db.delete(emailSkipList).where(eq(emailSkipList.id, id)).returning({ id: emailSkipList.id })
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
