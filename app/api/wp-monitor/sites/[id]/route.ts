import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, wpSites } from '@/lib/db'
import { wpGate } from '@/lib/wp-access'

type Ctx = { params: Promise<{ id: string }> }

const MAX_SNOOZE_HOURS = 24 * 14

/** PATCH /api/wp-monitor/sites/[id] { snooze_hours?: number (0 = stop snoozing), name?, company_id? } - snooze alarms for planned maintenance (staff), rename or relink (admin). */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await wpGate()
  if ('error' in g) return g.error
  const id = (await ctx.params).id
  const body = (await request.json().catch(() => ({}))) as { snooze_hours?: unknown; name?: unknown; company_id?: unknown }
  const set: Partial<typeof wpSites.$inferInsert> = {}

  if (body.snooze_hours !== undefined) {
    const h = Number(body.snooze_hours)
    if (!Number.isFinite(h) || h < 0 || h > MAX_SNOOZE_HOURS) return NextResponse.json({ error: `Snooze between 0 and ${MAX_SNOOZE_HOURS} hours` }, { status: 400 })
    set.snoozedUntil = h === 0 ? null : new Date(Date.now() + h * 3600000)
  }
  if (body.name !== undefined || body.company_id !== undefined) {
    if (g.role !== 'admin') return NextResponse.json({ error: 'Only an admin can rename or relink a site' }, { status: 403 })
    if (body.name !== undefined) set.name = String(body.name).trim().slice(0, 255) || null
    if (body.company_id !== undefined) set.companyId = body.company_id ? String(body.company_id) : null
  }
  if (Object.keys(set).length === 0) return NextResponse.json({ ok: true })

  const [row] = await db.update(wpSites).set(set).where(eq(wpSites.id, id)).returning({ id: wpSites.id, snoozedUntil: wpSites.snoozedUntil })
  if (!row) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  return NextResponse.json({ ok: true, snoozed_until: row.snoozedUntil })
}

/** DELETE /api/wp-monitor/sites/[id] - stops monitoring the site and removes its reports and alarms (admin only). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const g = await wpGate({ adminOnly: true })
  if ('error' in g) return g.error
  const [row] = await db.delete(wpSites).where(eq(wpSites.id, (await ctx.params).id)).returning({ id: wpSites.id })
  if (!row) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
