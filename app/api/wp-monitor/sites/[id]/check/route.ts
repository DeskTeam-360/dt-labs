import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, wpSites } from '@/lib/db'
import { wpGate } from '@/lib/wp-access'
import { checkWpSite } from '@/lib/wp-check'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

/** POST /api/wp-monitor/sites/[id]/check - look at the site now: open it, ask the plugin for a fresh report, update the alarms (staff). */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await wpGate()
  if ('error' in g) return g.error
  const [site] = await db.select().from(wpSites).where(eq(wpSites.id, (await ctx.params).id)).limit(1)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  return NextResponse.json(await checkWpSite(site))
}
