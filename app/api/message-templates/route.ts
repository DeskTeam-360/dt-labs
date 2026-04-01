import { auth } from '@/auth'
import { db, messageTemplates } from '@/lib/db'
import { canAccessMessageTemplates } from '@/lib/auth-utils'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function rowToJson(r: (typeof messageTemplates.$inferSelect)[]) {
  return r.map((row) => ({
    id: row.id,
    type: row.type,
    group: row.templateGroup,
    title: row.title,
    key: row.key,
    status: row.status,
    content: row.content ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  }))
}

/** GET /api/message-templates — admin only; all seeded templates */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessMessageTemplates(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select()
    .from(messageTemplates)
    .orderBy(asc(messageTemplates.templateGroup), asc(messageTemplates.type), asc(messageTemplates.title))

  return NextResponse.json(rowToJson(rows))
}
