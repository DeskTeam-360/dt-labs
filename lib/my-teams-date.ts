/** UTC calendar day string YYYY-MM-DD (same as `Date.toISOString().slice(0, 10)` for UTC instants). */
export function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function utcTodayYesterday(): { today: string; yesterday: string } {
  const now = new Date()
  const today = utcYmd(now)
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const yesterday = utcYmd(prev)
  return { today, yesterday }
}

/** Oldest selectable day for my-teams activity (inclusive), relative to today UTC. */
export const MY_TEAMS_ACTIVITY_MAX_PAST_DAYS = 730

/** True if `ymd` is a real calendar date and within allowed UTC range (not future, not too far past). */
export function isValidMyTeamsActivityDateYmd(ymd: string | null | undefined): boolean {
  if (!ymd || typeof ymd !== 'string') return false
  const bounds = utcDayBounds(ymd)
  if (!bounds) return false
  const { today } = utcTodayYesterday()
  const todayBounds = utcDayBounds(today)
  if (!todayBounds) return false
  if (bounds.start.getTime() > todayBounds.end.getTime()) return false
  const minStart = new Date(todayBounds.start)
  minStart.setUTCDate(minStart.getUTCDate() - MY_TEAMS_ACTIVITY_MAX_PAST_DAYS)
  if (bounds.end.getTime() < minStart.getTime()) return false
  return true
}

/**
 * Parse `date` query for my-teams activity.
 * Returns `fallback` (typically today UTC) when missing or invalid.
 */
export function parseMyTeamsActivityDateParam(date: string | null | undefined, fallback: string): string {
  const raw = (date ?? '').trim()
  if (raw && isValidMyTeamsActivityDateYmd(raw)) return raw
  return fallback
}

export function utcDayBounds(ymd: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const day = Number(m[3])
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
  const start = new Date(Date.UTC(y, mo - 1, day, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, mo - 1, day, 23, 59, 59, 999))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { start, end }
}
