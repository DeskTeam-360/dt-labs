import { eq } from 'drizzle-orm'

import { db, wpSites } from '@/lib/db'
import { assertPublicUrl } from '@/lib/web-screenshot'

const TIMEOUT_MS = 10000

/** Opens the site's address from this server. "Up" means any answer below HTTP 500: a login wall or a 404 still means the site is running. */
export async function checkSite(site: typeof wpSites.$inferSelect): Promise<{ ok: boolean; status: number | null; ms: number }> {
  const started = Date.now()
  try {
    await assertPublicUrl(site.siteUrl)
    const res = await fetch(site.siteUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'DeskTeam360-Monitor/1.0', Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    await res.body?.cancel().catch(() => undefined)
    return { ok: res.status < 500, status: res.status, ms: Date.now() - started }
  } catch {
    return { ok: false, status: null, ms: Date.now() - started }
  }
}

/** Checks the site and keeps the result: consecutive failures are counted and the moment it went down is remembered. */
export async function probeAndStore(site: typeof wpSites.$inferSelect): Promise<typeof wpSites.$inferSelect> {
  const r = await checkSite(site)
  const now = new Date()
  const failCount = r.ok ? 0 : site.uptimeFailCount + 1
  const patch = {
    uptimeOk: r.ok,
    uptimeStatus: r.status,
    uptimeMs: r.ms,
    uptimeCheckedAt: now,
    uptimeFailCount: failCount,
    uptimeDownSince: r.ok ? null : (site.uptimeDownSince ?? now),
  }
  await db.update(wpSites).set(patch).where(eq(wpSites.id, site.id))
  return { ...site, ...patch }
}
