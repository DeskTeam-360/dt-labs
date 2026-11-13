/** How a monitored WordPress site is doing, worked out from its latest report. Used by the company Websites tab (and meant for the dashboard and alarms). */

export type WpHealthLevel = 'red' | 'yellow' | 'green'
export type WpProblem = { code: string; level: 'red' | 'yellow' | 'info'; text: string }

export type WpUpdateItem = { name: string; version: string | null; new_version: string | null }

const updateList = (v: unknown): WpUpdateItem[] =>
  Array.isArray(v)
    ? v.map((u) => ({
        name: String(u?.name ?? u?.slug ?? 'Unknown').slice(0, 100),
        version: typeof u?.version === 'string' ? u.version : null,
        new_version: typeof u?.new_version === 'string' ? u.new_version : null,
      }))
    : []

export type WpFacts = {
  wp_version: string | null
  php_version: string | null
  core_update_available: boolean
  core_latest: string | null
  plugin_updates: number
  theme_updates: number
  ssl: { https: boolean; days_left: number | null; expired: boolean; valid_to: string | null; error: string | null }
  backup: { installed: boolean; last_time: string | null; last_success: boolean | null }
  failed_logins_24h: number | null
  wordfence: { active: boolean; open_issues: number | null; issues: { type: string; severity: number; message: string }[] }
  plugin_update_list: WpUpdateItem[]
  theme_update_list: WpUpdateItem[]
  last_seen_at: string | null
}

const HOUR_MS = 3600000
const DAY_MS = 86400000
const NO_REPORT_HOURS = 3
const BACKUP_MAX_DAYS = 30
const SSL_WARN_DAYS = 14
const PLUGIN_UPDATES_WARN = 5
const FAILED_LOGINS_WARN = 50
const MIN_PHP = 8.1

type Report = Record<string, any> | null | undefined

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const phpMajorMinor = (v: string | null) => {
  const m = /^(\d+)\.(\d+)/.exec(v ?? '')
  return m ? Number(`${m[1]}.${m[2]}`) : null
}
const ago = (ms: number) => (ms >= DAY_MS ? `${Math.floor(ms / DAY_MS)} days` : `${Math.max(1, Math.floor(ms / HOUR_MS))} hours`)

/** The facts worth showing and the problems found (red = act now, yellow = look at it, info = for your knowledge). */
export function evaluateWpSite(lastSeenAt: Date | string | null | undefined, report: Report, now: Date = new Date()): { level: WpHealthLevel; problems: WpProblem[]; facts: WpFacts } {
  const r = report ?? {}
  const seen = lastSeenAt ? new Date(lastSeenAt) : null
  const problems: WpProblem[] = []

  const updates = r.updates ?? {}
  const ssl = r.ssl ?? {}
  const backup = r.backup ?? {}
  const wf = r.wordfence ?? {}
  const users = r.users ?? {}
  const facts: WpFacts = {
    wp_version: typeof r.wp_version === 'string' ? r.wp_version : null,
    php_version: typeof r.php_version === 'string' ? r.php_version : null,
    core_update_available: updates.core_update_available === true,
    core_latest: typeof updates.core_latest === 'string' ? updates.core_latest : null,
    plugin_updates: Array.isArray(updates.plugins) ? updates.plugins.length : 0,
    theme_updates: Array.isArray(updates.themes) ? updates.themes.length : 0,
    ssl: {
      https: ssl.https === true,
      days_left: num(ssl.days_left),
      expired: ssl.expired === true,
      valid_to: typeof ssl.valid_to === 'string' ? ssl.valid_to : null,
      error: typeof ssl.error === 'string' ? ssl.error : null,
    },
    backup: {
      installed: backup.updraftplus === true,
      last_time: typeof backup.last_time === 'string' ? backup.last_time : null,
      last_success: typeof backup.last_success === 'boolean' ? backup.last_success : null,
    },
    failed_logins_24h: num(users.failed_logins_24h),
    wordfence: {
      active: wf.active === true,
      open_issues: num(wf.open_issues),
      issues: Array.isArray(wf.issues)
        ? wf.issues.map((i: any) => ({ type: String(i?.type ?? ''), severity: Number(i?.severity ?? 0), message: String(i?.message ?? '').slice(0, 300) }))
        : [],
    },
    plugin_update_list: updateList(updates.plugins),
    theme_update_list: updateList(updates.themes),
    last_seen_at: seen ? seen.toISOString() : null,
  }

  if (!seen) problems.push({ code: 'no_report', level: 'yellow', text: 'No report received yet' })
  else if (now.getTime() - seen.getTime() > NO_REPORT_HOURS * HOUR_MS) problems.push({ code: 'no_report', level: 'red', text: `No report for ${ago(now.getTime() - seen.getTime())}` })

  if (seen) {
    if (facts.ssl.expired) problems.push({ code: 'ssl', level: 'red', text: 'SSL certificate expired' })
    else if (facts.ssl.days_left !== null && facts.ssl.days_left <= SSL_WARN_DAYS) problems.push({ code: 'ssl', level: 'yellow', text: `SSL certificate expires in ${facts.ssl.days_left} days` })

    if (facts.backup.installed) {
      const last = facts.backup.last_time ? new Date(facts.backup.last_time) : null
      // Real backups live in IDrive, so UpdraftPlus is for information only and never raises an alarm.
      if (facts.backup.last_success === false) problems.push({ code: 'backup', level: 'info', text: 'The last UpdraftPlus backup failed' })
      else if (!last) problems.push({ code: 'backup', level: 'info', text: 'No UpdraftPlus backup has been made yet' })
      else if (now.getTime() - last.getTime() > BACKUP_MAX_DAYS * DAY_MS) problems.push({ code: 'backup', level: 'info', text: `Last UpdraftPlus backup is ${ago(now.getTime() - last.getTime())} old` })
    } else {
      problems.push({ code: 'no_updraft', level: 'info', text: 'UpdraftPlus is not installed (no backup information)' })
    }

    const php = phpMajorMinor(facts.php_version)
    if (php !== null && php < MIN_PHP) problems.push({ code: 'php_old', level: 'yellow', text: `PHP ${facts.php_version} is below ${MIN_PHP}` })
    if (facts.core_update_available) problems.push({ code: 'core_update', level: 'yellow', text: `WordPress update available${facts.core_latest ? ` (${facts.core_latest})` : ''}` })
    if (facts.plugin_updates >= PLUGIN_UPDATES_WARN) problems.push({ code: 'plugin_updates', level: 'yellow', text: `${facts.plugin_updates} plugin updates pending` })
    if (facts.failed_logins_24h !== null && facts.failed_logins_24h > FAILED_LOGINS_WARN) problems.push({ code: 'failed_logins', level: 'yellow', text: `${facts.failed_logins_24h} failed logins in 24 hours` })
    if (facts.wordfence.open_issues !== null && facts.wordfence.open_issues > 0) problems.push({ code: 'wordfence', level: 'yellow', text: `${facts.wordfence.open_issues} open Wordfence issue${facts.wordfence.open_issues === 1 ? '' : 's'}` })
  }

  const level: WpHealthLevel = problems.some((p) => p.level === 'red') ? 'red' : problems.some((p) => p.level === 'yellow') ? 'yellow' : 'green'
  return { level, problems, facts }
}
