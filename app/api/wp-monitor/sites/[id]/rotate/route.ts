import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, wpSites } from '@/lib/db'
import { wpGate } from '@/lib/wp-access'

/** POST /api/wp-monitor/sites/[id]/rotate - a new secret key, shown once (admin only). The plugin must be given it before its next report. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await wpGate({ adminOnly: true })
  if ('error' in g) return g.error
  const key = randomBytes(32).toString('hex')
  const [row] = await db.update(wpSites).set({ secretKey: key, lastSignature: null }).where(eq(wpSites.id, (await ctx.params).id)).returning({ id: wpSites.id })
  if (!row) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  return NextResponse.json({ id: row.id, secret_key: key })
}
