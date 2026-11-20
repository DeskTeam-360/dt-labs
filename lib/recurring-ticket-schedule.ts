/**
 * Scheduling logic for recurring tickets.
 * Pure functions — no DB calls, no side effects.
 */

export type Frequency = 'daily' | 'weekdays' | 'weekends' | 'specific_days' | 'specific_date' | 'specific_year_date' | 'interval'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * Dates of the year are stored as numbers month*100+day (28 November = 1128) in the same column as the monthly days.
 * Keeps unique valid ones (29 February is allowed: it only fires in leap years), sorted by month then day.
 */
export function normalizeYearDates(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  return [...new Set(
    raw.map(Number).filter((n) => {
      const m = Math.floor(n / 100)
      const d = n % 100
      return Number.isInteger(n) && m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN_MONTH[m - 1]
    })
  )].sort((a, b) => a - b)
}

/** "28 Nov" for 1128. */
export function yearDateLabel(mmdd: number): string {
  return `${mmdd % 100} ${MONTH_NAMES[Math.floor(mmdd / 100) - 1]}`
}

/** Every day of the year as a picker option (value 1128, label "28 Nov"). */
export const YEAR_DATE_OPTIONS: { value: number; label: string }[] = DAYS_IN_MONTH.flatMap((days, mi) =>
  Array.from({ length: days }, (_, di) => ({ value: (mi + 1) * 100 + di + 1, label: yearDateLabel((mi + 1) * 100 + di + 1) }))
)

export interface RecurringSchedule {
  frequency: Frequency
  specificDays?: number[] | null   // 0=Sun … 6=Sat
  specificDate?: number | number[] | null  // 1–31 (legacy single int or array)
  intervalDays?: number | null     // every N days
  timeOfDay: string                // 'HH:MM'
  timezone: string
  startDate: string                // 'YYYY-MM-DD'
  endDate?: string | null
}

/** Normalize stored/input monthly dates (legacy single int or int[]) to unique 1–31. */
export function normalizeSpecificDates(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  return [...new Set(
    raw.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
  )].sort((a, b) => a - b)
}

/** Convert 'HH:MM' + YYYY-MM-DD + timezone → UTC Date */
function localDayAtTime(ymd: string, timeOfDay: string, tz: string): Date {
  const [h, m] = timeOfDay.split(':').map(Number)
  const [y, mo, d] = ymd.split('-').map(Number)
  // Build an ISO string that JS can parse in the target timezone via Intl
  // We use a simple approach: format a date-time in the tz and get its UTC offset
  const tentative = new Date(Date.UTC(y, mo - 1, d, h, m, 0, 0))
  // Get UTC offset for that tz at that tentative time
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(tentative)
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10)
  const localY = get('year'), localM = get('month') - 1, localD = get('day')
  const localH = get('hour') === 24 ? 0 : get('hour'), localMin = get('minute')
  // Offset in ms
  const localAsUtc = Date.UTC(localY, localM, localD, localH, localMin, 0, 0)
  const offset = localAsUtc - tentative.getTime()
  // Build the actual target
  const targetUtc = Date.UTC(y, mo - 1, d, h, m, 0, 0) - offset
  return new Date(targetUtc)
}

/** Returns the day-of-week (0=Sun…6=Sat) for a 'YYYY-MM-DD' string in the given timezone */
function dowInTz(ymd: string, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)) // noon UTC
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
  const day = fmt.format(dt)
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(day)
}

/** Add N calendar days to a 'YYYY-MM-DD' string */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** Check if a 'YYYY-MM-DD' qualifies under the schedule (ignoring time) */
function dateMatchesFrequency(ymd: string, schedule: RecurringSchedule): boolean {
  const dow = dowInTz(ymd, schedule.timezone)
  switch (schedule.frequency) {
    case 'daily':
      return true
    case 'weekdays':
      return dow >= 1 && dow <= 5
    case 'weekends':
      return dow === 0 || dow === 6
    case 'specific_days': {
      const days = schedule.specificDays ?? []
      return days.includes(dow)
    }
    case 'specific_date': {
      const [, , dd] = ymd.split('-').map(Number)
      return normalizeSpecificDates(schedule.specificDate).includes(dd)
    }
    case 'specific_year_date': {
      const [, mm, dd] = ymd.split('-').map(Number)
      return normalizeYearDates(schedule.specificDate).includes(mm * 100 + dd)
    }
    case 'interval':
      return true // interval is handled in computeNextRunAt (every N days counted from the start date)
    default:
      return false
  }
}

/**
 * Compute the next UTC Date the recurring ticket should fire,
 * given a reference point (usually now or lastRunAt).
 * Returns null if no future run (e.g. past endDate).
 */
export function computeNextRunAt(
  schedule: RecurringSchedule,
  after: Date = new Date()
): Date | null {
  const endDate = schedule.endDate ?? null

  // Every N days is counted from the start date: the start date is the first run (even when it is in the future),
  // then start + N, start + 2N ... The next run is the first one of that series that is after `after`.
  if (schedule.frequency === 'interval') {
    const n = Math.max(1, schedule.intervalDays ?? 1)
    const dayMs = 86400000
    const afterYmd = after.toISOString().slice(0, 10)
    const gap = Math.floor((Date.parse(`${afterYmd}T00:00:00Z`) - Date.parse(`${schedule.startDate}T00:00:00Z`)) / dayMs)
    let k = Math.max(0, Math.floor(gap / n) - 1) // jump close to `after`, then step
    for (let i = 0; i < 10; i++, k++) {
      const ymd = addDays(schedule.startDate, k * n)
      if (endDate && ymd > endDate) return null
      const t = localDayAtTime(ymd, schedule.timeOfDay, schedule.timezone)
      if (t > after) return t
    }
    return null
  }

  // Walk forward day by day (max 400 days, or 4 years and a bit for dates of the year, to avoid an endless loop)
  // Start from today so a rule created/updated mid-day can still fire today
  let candidate = after.toISOString().slice(0, 10)
  if (candidate < schedule.startDate) candidate = schedule.startDate

  const maxDays = schedule.frequency === 'specific_year_date' ? 1500 : 400
  for (let i = 0; i < maxDays; i++) {
    if (endDate && candidate > endDate) return null
    if (dateMatchesFrequency(candidate, schedule)) {
      const t = localDayAtTime(candidate, schedule.timeOfDay, schedule.timezone)
      if (t > after) return t
    }
    candidate = addDays(candidate, 1)
  }
  return null
}

/** Human-readable label for a frequency */
export function frequencyLabel(schedule: RecurringSchedule): string {
  switch (schedule.frequency) {
    case 'daily': return 'Every day'
    case 'weekdays': return 'Weekdays (Mon–Fri)'
    case 'weekends': return 'Weekends (Sat–Sun)'
    case 'specific_days': {
      const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const days = (schedule.specificDays ?? []).map(d => names[d]).join(', ')
      return `Every ${days}`
    }
    case 'specific_date': {
      const dates = normalizeSpecificDates(schedule.specificDate)
      if (dates.length === 0) return 'Monthly'
      if (dates.length === 1) return `Monthly on day ${dates[0]}`
      return `Monthly on days ${dates.join(', ')}`
    }
    case 'specific_year_date': {
      const dates = normalizeYearDates(schedule.specificDate)
      return dates.length === 0 ? 'Yearly' : `Every year on ${dates.map(yearDateLabel).join(', ')}`
    }
    case 'interval':
      return `Every ${schedule.intervalDays ?? 1} day(s)`
    default:
      return schedule.frequency
  }
}
