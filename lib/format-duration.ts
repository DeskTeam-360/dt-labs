/**
 * One way to show an amount of time on screen: "45m", "1h 05m", "12h 30m". Minutes are always two digits once there is an hour.
 * Totals must be added up in seconds and formatted once at the end (adding rounded rows can drift by minutes).
 * Decimal hours are for sums and exports, not for reading; use formatHours for a number of hours.
 */

/** Seconds as "45m" or "1h 05m". Negative values keep a minus sign ("-0h 20m" shows as "-20m"). Zero is "0m". */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Number(seconds)
  if (!Number.isFinite(s)) return '0m'
  const m = Math.round(Math.abs(s) / 60)
  const sign = s < 0 && m > 0 ? '-' : ''
  if (m < 60) return `${sign}${m}m`
  return `${sign}${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Seconds as the duration, or "—" when there is no value at all (a missing value is not the same as zero). */
export function formatDurationOrDash(seconds: number | null | undefined): string {
  return seconds == null || !Number.isFinite(Number(seconds)) ? '—' : formatDuration(seconds)
}

/** A number of hours (2.95) as "2h 57m". */
export function formatHours(hours: number | null | undefined): string {
  return formatDuration(Number(hours) * 3600)
}

/** A number of hours, or "—" when there is no value. */
export function formatHoursOrDash(hours: number | null | undefined): string {
  return hours == null || !Number.isFinite(Number(hours)) ? '—' : formatHours(hours)
}

/** For a clock that is running (a live timer): "1h 05m 09s", "5m 09s", "9s". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}
