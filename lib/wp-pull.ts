import { createHmac } from 'crypto'

import type { wpSites } from '@/lib/db'
import { assertPublicUrl } from '@/lib/web-screenshot'
import { storeWpReport } from '@/lib/wp-ingest'

const TIMEOUT_MS = 20000

/**
 * Asks the plugin on the site for a fresh report (GET /wp-json/dt360-monitor/v1/report, signed with the site's key) and keeps it.
 * No schedule is involved: it is used when a crawl finishes and when someone presses "Check now". When the site does not answer or
 * runs an older plugin, the report already on file stays and the reason is returned.
 */
export async function pullWpReport(site: typeof wpSites.$inferSelect): Promise<{ ok: true; site: typeof wpSites.$inferSelect } | { ok: false; message: string }> {
  try {
    const base = (await assertPublicUrl(site.siteUrl)).origin + new URL(site.siteUrl).pathname.replace(/\/+$/, '')
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = createHmac('sha256', site.secretKey).update(`${ts}.report`).digest('hex')
    const res = await fetch(`${base}/wp-json/dt360-monitor/v1/report`, {
      headers: { 'X-DT360-Timestamp': ts, 'X-DT360-Signature': sig, Accept: 'application/json', 'User-Agent': 'DeskTeam360-Monitor/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (res.status === 404) return { ok: false, message: 'The plugin on the site is too old to answer on request (install the newest version)' }
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'The site refused the key (check DT360_MONITOR_KEY in wp-config.php)' }
    if (!res.ok) return { ok: false, message: `The site answered HTTP ${res.status}` }
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, message: 'The site did not send a report' }
    return { ok: true, site: await storeWpReport(site, payload) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'The site could not be reached' }
  }
}
