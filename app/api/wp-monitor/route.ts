import { createHmac, timingSafeEqual } from 'crypto'
import { and,eq, lt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db, wpSiteReports, wpSites } from '@/lib/db'
import { syncSiteAlarms } from '@/lib/wp-alarms'
import { normaliseSiteUrl } from '@/lib/wp-monitor'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 1_000_000
const MAX_SKEW_SECONDS = 300
const KEEP_REPORT_DAYS = 90
const MIN_SECONDS_BETWEEN_REPORTS = 20

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * POST /api/wp-monitor — called by the deskteam360-monitor WordPress plugin.
 * Headers: X-DT360-Site, X-DT360-Timestamp, X-DT360-Signature = HMAC-SHA256(site key, `${timestamp}.${rawBody}`).
 * The site must be registered first (POST /api/wp-monitor/sites, admin only).
 */
export async function POST(request: NextRequest) {
  const siteHeader = request.headers.get('x-dt360-site')
  const ts = request.headers.get('x-dt360-timestamp')
  const sig = request.headers.get('x-dt360-signature')
  if (!siteHeader || !ts || !sig) return NextResponse.json({ error: 'Missing headers' }, { status: 400 })

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_SKEW_SECONDS) {
    return NextResponse.json({ error: 'Timestamp out of range' }, { status: 401 })
  }

  const raw = await request.text()
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: 'Too large' }, { status: 413 })

  const [site] = await db.select().from(wpSites).where(eq(wpSites.siteUrl, normaliseSiteUrl(siteHeader))).limit(1)
  const expected = createHmac('sha256', site?.secretKey ?? 'unknown-site').update(`${ts}.${raw}`).digest('hex')
  if (!site || !safeEqualHex(expected, sig)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // The same signed request cannot be sent twice, and a site cannot flood the endpoint.
  if (site.lastSignature && safeEqualHex(site.lastSignature, sig)) return NextResponse.json({ error: 'Report already received' }, { status: 409 })
  if (site.lastSeenAt && Date.now() - new Date(site.lastSeenAt).getTime() < MIN_SECONDS_BETWEEN_REPORTS * 1000) {
    return NextResponse.json({ error: 'Too many reports; wait a moment' }, { status: 429 })
  }

  // Administrator email addresses are not needed to spot a new administrator (the id and login are enough), so they are not kept.
  const users = payload.users as { administrators?: Record<string, unknown>[] } | undefined
  if (users && Array.isArray(users.administrators)) {
    users.administrators = users.administrators.map(({ email: _email, ...rest }) => rest)
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 50) : null)
  const [updated] = await db
    .update(wpSites)
    .set({
      wpVersion: str(payload.wp_version),
      phpVersion: str(payload.php_version),
      lastReport: payload,
      lastSeenAt: new Date(),
      lastSignature: sig.slice(0, 64),
    })
    .where(eq(wpSites.id, site.id))
    .returning()
  await db.insert(wpSiteReports).values({ siteId: site.id, payload })
  await db
    .delete(wpSiteReports)
    .where(and(eq(wpSiteReports.siteId, site.id), lt(wpSiteReports.createdAt, new Date(Date.now() - KEEP_REPORT_DAYS * 86400000))))

  // Alarms follow the new report at once; a failure here never makes the plugin's report fail.
  if (updated) await syncSiteAlarms(updated).catch((e) => console.error('[wp-monitor] alarms:', e))

  return NextResponse.json({ ok: true })
}
