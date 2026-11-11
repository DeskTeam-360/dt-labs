import { desc, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { companies, db, wpSiteAlarms, wpSites } from '@/lib/db'
import { wpGate } from '@/lib/wp-access'
import { evaluateWpSite } from '@/lib/wp-health'

export const dynamic = 'force-dynamic'

const RANK = { red: 0, yellow: 1, green: 2 } as const

/** GET /api/wp-monitor/overview -> every registered site with how it is doing, the worst first. */
export async function GET() {
  const g = await wpGate()
  if ('error' in g) return g.error

  const [sites, companyRows, alarms] = await Promise.all([
    db.select().from(wpSites).orderBy(desc(wpSites.createdAt)),
    db.select({ id: companies.id, name: companies.name }).from(companies),
    db.select().from(wpSiteAlarms).where(isNull(wpSiteAlarms.clearedAt)),
  ])
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]))
  const alarmsBySite = new Map<string, typeof alarms>()
  for (const a of alarms) alarmsBySite.set(a.siteId, [...(alarmsBySite.get(a.siteId) ?? []), a])

  const data = sites
    .map((s) => {
      const h = evaluateWpSite(s.lastSeenAt, s.lastReport as Record<string, unknown> | null)
      const open = alarmsBySite.get(s.id) ?? []
      // This server's own check can make a site red even when the report looks fine.
      const down = s.uptimeFailCount >= 2
      const health = down ? 'red' : open.some((a) => a.level === 'red') ? 'red' : open.some((a) => a.level === 'yellow') ? 'yellow' : h.level
      return {
        id: s.id,
        site_url: s.siteUrl,
        name: s.name,
        company_id: s.companyId,
        company_name: s.companyId ? (companyName.get(s.companyId) ?? null) : null,
        health,
        problems: open.length ? open.map((a) => ({ code: a.code, level: a.level, text: a.message })) : h.problems,
        facts: h.facts,
        uptime: { ok: s.uptimeOk, status: s.uptimeStatus, ms: s.uptimeMs, checked_at: s.uptimeCheckedAt, down_since: s.uptimeDownSince },
        snoozed_until: s.snoozedUntil,
        last_seen_at: s.lastSeenAt,
      }
    })
    .sort((a, b) => RANK[a.health as keyof typeof RANK] - RANK[b.health as keyof typeof RANK] || (a.name ?? a.site_url).localeCompare(b.name ?? b.site_url))

  return NextResponse.json({ sites: data })
}
