import { randomBytes } from 'crypto'
import { desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, wpSites } from '@/lib/db'
import { normaliseSiteUrl } from '@/lib/wp-monitor'


export const dynamic = 'force-dynamic'

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!isAdmin(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

/** GET /api/wp-monitor/sites -> registered sites with their latest versions (keys are never returned). */
export async function GET() {
  const denied = await gate()
  if (denied) return denied
  const rows = await db.select().from(wpSites).orderBy(desc(wpSites.createdAt))
  return NextResponse.json({
    sites: rows.map((r) => ({
      id: r.id,
      site_url: r.siteUrl,
      name: r.name,
      company_id: r.companyId,
      wp_version: r.wpVersion,
      php_version: r.phpVersion,
      last_seen_at: r.lastSeenAt,
      last_report: r.lastReport,
    })),
  })
}

/** POST /api/wp-monitor/sites { site_url, name?, company_id? } -> registers a site and returns its key ONCE. */
export async function POST(request: Request) {
  const denied = await gate()
  if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as { site_url?: string; name?: string; company_id?: string }
  if (!body.site_url || !/^https?:\/\//i.test(body.site_url)) {
    return NextResponse.json({ error: 'site_url must start with http:// or https://' }, { status: 400 })
  }
  const key = randomBytes(32).toString('hex')
  try {
    const [row] = await db
      .insert(wpSites)
      .values({ siteUrl: normaliseSiteUrl(body.site_url), name: body.name ?? null, companyId: body.company_id ?? null, secretKey: key })
      .returning({ id: wpSites.id, siteUrl: wpSites.siteUrl })
    return NextResponse.json({ id: row.id, site_url: row.siteUrl, secret_key: key }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'This site is already registered' }, { status: 409 })
  }
}
