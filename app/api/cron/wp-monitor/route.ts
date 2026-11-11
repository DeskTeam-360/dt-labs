import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db, wpSites } from '@/lib/db'
import { syncSiteAlarms } from '@/lib/wp-alarms'
import { probeAndStore } from '@/lib/wp-uptime'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CONCURRENCY = 5
const KEEP_REPORT_DAYS = 90
/** Older than this, a report loses the personal details (comment texts and authors, login names, Wordfence log); its numbers stay. */
const KEEP_DETAIL_DAYS = 30

function cronAuthResult(request: NextRequest): 'ok' | 'missing_secret' | 'bad_key' {
  const secret = process.env.WP_MONITOR_CRON_SECRET ?? process.env.SYNC_INBOX_CRON_SECRET
  if (!secret) return 'missing_secret'
  const authHeader = request.headers.get('authorization')
  const apiKey = request.headers.get('x-api-key')
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKey
  return key === secret ? 'ok' : 'bad_key'
}

/**
 * POST /api/cron/wp-monitor
 * Every registered WordPress site: this server opens its address (so a site that is down shows even though it cannot report),
 * then its alarms are brought up to date (this is also what notices "no report for 3 hours"). Old reports are trimmed.
 * Schedule: every 5 minutes.
 *
 * Auth: WP_MONITOR_CRON_SECRET (falls back to SYNC_INBOX_CRON_SECRET) via `Authorization: Bearer <secret>` or `x-api-key`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = cronAuthResult(request)
    if (auth === 'missing_secret') return NextResponse.json({ error: 'WP_MONITOR_CRON_SECRET is not set' }, { status: 503 })
    if (auth === 'bad_key') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sites = await db.select().from(wpSites)
    let opened = 0
    let cleared = 0
    let down = 0
    for (let i = 0; i < sites.length; i += CONCURRENCY) {
      const batch = await Promise.all(
        sites.slice(i, i + CONCURRENCY).map(async (s) => {
          const fresh = await probeAndStore(s)
          if (fresh.uptimeFailCount >= 2) down++
          return syncSiteAlarms(fresh).catch((e) => {
            console.error('[wp-monitor] alarms for', s.siteUrl, e)
            return { opened: 0, cleared: 0 }
          })
        })
      )
      for (const b of batch) {
        opened += b.opened
        cleared += b.cleared
      }
    }

    await db.execute(sql`DELETE FROM wp_site_reports WHERE created_at < now() - make_interval(days => ${KEEP_REPORT_DAYS})`)
    await db.execute(sql`
      UPDATE wp_site_reports
      SET payload = payload #- '{comments,recent}' #- '{users,failed_login_users}' #- '{wordfence,log}' #- '{wordfence,issues}'
      WHERE created_at < now() - make_interval(days => ${KEEP_DETAIL_DAYS})
        AND (payload #> '{comments,recent}' IS NOT NULL OR payload #> '{users,failed_login_users}' IS NOT NULL
             OR payload #> '{wordfence,log}' IS NOT NULL OR payload #> '{wordfence,issues}' IS NOT NULL)
    `)

    return NextResponse.json({ ok: true, sites: sites.length, down, alarms_opened: opened, alarms_cleared: cleared })
  } catch (e) {
    console.error('[cron/wp-monitor]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
