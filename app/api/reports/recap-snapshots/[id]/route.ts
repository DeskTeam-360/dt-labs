import { and, eq, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, recapSnapshots } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET — one recap snapshot including JSON payload (admin/manager). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const [row] = await db.select().from(recapSnapshots).where(eq(recapSnapshots.id, id)).limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: row })
}

const TITLE_MAX = 500

/** PATCH — update title and/or JSON payload (admin/manager). Teams/period stay fixed (unique key). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const o = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  const titleRaw = o && 'title' in o ? o.title : undefined
  const payloadRaw = o && 'payload' in o ? o.payload : undefined

  const hasTitle = titleRaw !== undefined
  const hasPayload = payloadRaw !== undefined
  if (!hasTitle && !hasPayload) {
    return NextResponse.json({ error: 'Provide title and/or payload' }, { status: 400 })
  }

  let nextTitle: string | undefined
  if (hasTitle) {
    if (typeof titleRaw !== 'string') {
      return NextResponse.json({ error: 'title must be a string' }, { status: 400 })
    }
    const t = titleRaw.trim()
    if (!t) {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    }
    if (t.length > TITLE_MAX) {
      return NextResponse.json({ error: `title must be at most ${TITLE_MAX} characters` }, { status: 400 })
    }
    nextTitle = t
  }

  let nextPayload: Record<string, unknown> | undefined
  if (hasPayload) {
    if (typeof payloadRaw !== 'object' || payloadRaw === null || Array.isArray(payloadRaw)) {
      return NextResponse.json({ error: 'payload must be a JSON object' }, { status: 400 })
    }
    nextPayload = payloadRaw as Record<string, unknown>
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  const [existing] = await db.select().from(recapSnapshots).where(eq(recapSnapshots.id, id)).limit(1)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const mergedTitle = nextTitle ?? existing.title
  const mergedPayload = nextPayload ?? (existing.payload as Record<string, unknown>)

  if (nextTitle !== undefined && nextTitle !== existing.title) {
    const [conflict] = await db
      .select({ id: recapSnapshots.id })
      .from(recapSnapshots)
      .where(
        and(
          eq(recapSnapshots.teamKey, existing.teamKey),
          eq(recapSnapshots.periodStart, existing.periodStart),
          eq(recapSnapshots.periodEnd, existing.periodEnd),
          eq(recapSnapshots.title, mergedTitle),
          ne(recapSnapshots.id, id)
        )
      )
      .limit(1)
    if (conflict) {
      return NextResponse.json(
        { error: 'Another recap already uses this title for the same teams and period.' },
        { status: 409 }
      )
    }
  }

  await db
    .update(recapSnapshots)
    .set({
      title: mergedTitle,
      payload: mergedPayload,
      updatedAt: new Date(),
      createdBy: userId,
    })
    .where(eq(recapSnapshots.id, id))

  const [updated] = await db.select().from(recapSnapshots).where(eq(recapSnapshots.id, id)).limit(1)

  return NextResponse.json({ data: updated ?? null })
}
