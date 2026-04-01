import { auth } from '@/auth'
import { db, messageTemplates } from '@/lib/db'
import { canAccessMessageTemplates } from '@/lib/auth-utils'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function assertAdmin(session: { user?: { role?: string } } | null) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  if (!canAccessMessageTemplates(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** GET /api/message-templates/[id] */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const deny = assertAdmin(session)
  if (deny) return deny

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    type: row.type,
    group: row.templateGroup,
    title: row.title,
    key: row.key,
    status: row.status,
    content: row.content ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}

/** PATCH /api/message-templates/[id] — body: { content?: string | null, status?: 'active' | 'inactive' } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const deny = assertAdmin(session)
  if (deny) return deny

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { content, status } = body as { content?: string | null; status?: string }

  const updates: Partial<typeof messageTemplates.$inferInsert> = {
    updatedAt: new Date(),
  }
  let touched = false

  if (content !== undefined) {
    updates.content = content === null || content === '' ? null : String(content)
    touched = true
  }
  if (status !== undefined) {
    const s = String(status).toLowerCase()
    if (s !== 'active' && s !== 'inactive') {
      return NextResponse.json({ error: 'status must be active or inactive' }, { status: 400 })
    }
    updates.status = s
    touched = true
  }

  if (!touched) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [row] = await db
    .update(messageTemplates)
    .set(updates)
    .where(eq(messageTemplates.id, id))
    .returning()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    type: row.type,
    group: row.templateGroup,
    title: row.title,
    key: row.key,
    status: row.status,
    content: row.content ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}
