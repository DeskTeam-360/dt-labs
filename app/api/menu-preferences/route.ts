import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { setAppSetting } from '@/lib/app-settings'
import { isAdmin } from '@/lib/auth-utils'
import { appSettings, db, userMenuPreferences } from '@/lib/db'
import { sidebarItemsForRole } from '@/lib/sidebar-menu'

export const dynamic = 'force-dynamic'

const LOCKED_KEY = 'sidebar_locked_items'

async function readLocked(): Promise<string[]> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, LOCKED_KEY)).limit(1)
  try {
    const v = JSON.parse(row?.value ?? '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function staffRole(session: { user?: unknown } | null): string | null {
  const role = ((session?.user as { role?: string } | undefined)?.role ?? '').toLowerCase()
  return role && role !== 'customer' ? role : null
}

/** GET /api/menu-preferences -> { order, hidden, locked } for the signed-in staff member. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !staffRole(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [row] = await db.select().from(userMenuPreferences).where(eq(userMenuPreferences.userId, session.user.id)).limit(1)
  return NextResponse.json({ order: row?.itemOrder ?? [], hidden: row?.hiddenItems ?? [], locked: await readLocked() })
}

/**
 * PUT /api/menu-preferences { order?, hidden?, locked? }
 * order and hidden are the caller's own menu; locked (items nobody can hide) is admin only.
 */
export async function PUT(request: Request) {
  const session = await auth()
  const role = staffRole(session)
  if (!session?.user?.id || !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { order?: unknown; hidden?: unknown; locked?: unknown }
  const known = new Set(sidebarItemsForRole('admin').map((i) => i.key))
  const clean = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter((k) => known.has(k)))] : [])

  if (body.locked !== undefined) {
    if (!isAdmin(role)) return NextResponse.json({ error: 'Only an admin can lock items' }, { status: 403 })
    await setAppSetting(LOCKED_KEY as never, JSON.stringify(clean(body.locked)))
  }
  if (body.order !== undefined || body.hidden !== undefined) {
    const values = { itemOrder: clean(body.order), hiddenItems: clean(body.hidden), updatedAt: new Date() }
    await db
      .insert(userMenuPreferences)
      .values({ userId: session.user.id, ...values })
      .onConflictDoUpdate({ target: userMenuPreferences.userId, set: values })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE /api/menu-preferences -> back to the default menu for the caller. */
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id || !staffRole(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await db.delete(userMenuPreferences).where(eq(userMenuPreferences.userId, session.user.id))
  return NextResponse.json({ ok: true })
}
