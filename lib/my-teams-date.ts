/** Calendar date YYYY-MM-DD in the browser / environment local timezone. */
export function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function localTodayYesterday(): { today: string; yesterday: string } {
  const now = new Date()
  const today = localYmd(now)
  const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return { today, yesterday: localYmd(prev) }
}

export const MY_TEAMS_ACTIVITY_MAX_PAST_DAYS = 730

/** Start/end of a local calendar day for `ymd` (same clock as `Date` local getters). */
export function localDayBoundsFromYmd(ymd: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const day = Number(m[3])
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
  const start = new Date(y, mo - 1, day, 0, 0, 0, 0)
  const end = new Date(y, mo - 1, day, 23, 59, 59, 999)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (start.getFullYear() !== y || start.getMonth() !== mo - 1 || start.getDate() !== day) return null
  return { start, end }
}

/** True if `ymd` is a real local calendar date and within allowed range (not future, not too far past). */
export function isValidMyTeamsActivityDateYmd(ymd: string | null | undefined): boolean {
  if (!ymd || typeof ymd !== 'string') return false
  const bounds = localDayBoundsFromYmd(ymd)
  if (!bounds) return false
  const { today } = localTodayYesterday()
  const todayBounds = localDayBoundsFromYmd(today)
  if (!todayBounds) return false
  if (bounds.start.getTime() > todayBounds.end.getTime()) return false
  const minStart = new Date(todayBounds.start)
  minStart.setDate(minStart.getDate() - MY_TEAMS_ACTIVITY_MAX_PAST_DAYS)
  if (bounds.end.getTime() < minStart.getTime()) return false
  return true
}

/**
 * Validates `day_start` / `day_end` from the client (ISO instants for one local calendar day).
 * Allows ~18–30h span for DST; blocks future days and very old windows.
 */
export function validateMyTeamsActivityDayWindow(dayStart: Date, dayEnd: Date): boolean {
  if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) return false
  if (dayEnd.getTime() < dayStart.getTime()) return false
  const span = dayEnd.getTime() - dayStart.getTime()
  if (span < 18 * 3600 * 1000 || span > 30 * 3600 * 1000) return false
  const now = Date.now()
  if (dayEnd.getTime() > now + 120_000) return false
  const minStartMs = now - (MY_TEAMS_ACTIVITY_MAX_PAST_DAYS + 1) * 86400000
  if (dayStart.getTime() < minStartMs) return false
  return true
}
