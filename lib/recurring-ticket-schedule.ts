/**
 * Scheduling logic for recurring tickets.
 * Pure functions — no DB calls, no side effects.
 */

export type Frequency = 'daily' | 'weekdays' | 'weekends' | 'specific_days' | 'specific_date' | 'interval'

export interface RecurringSchedule {
  frequency: Frequency
  specificDays?: number[] | null   // 0=Sun … 6=Sat
  specificDate?: number | null     // 1–31
  intervalDays?: number | null     // every N days
  timeOfDay: string                // 'HH:MM'
  timezone: string
  startDate: string                // 'YYYY-MM-DD'
  endDate?: string | null
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
      return dd === (schedule.specificDate ?? 1)
    }
    case 'interval':
      return true // interval is handled externally via lastRunAt
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

  // For interval frequency, just add N days from `after`
  if (schedule.frequency === 'interval') {
    const n = schedule.intervalDays ?? 1
    const nextYmd = addDays(after.toISOString().slice(0, 10), n)
    if (endDate && nextYmd > endDate) return null
    return localDayAtTime(nextYmd, schedule.timeOfDay, schedule.timezone)
  }

  // Walk forward day by day (max 400 days to avoid infinite loop)
  // Start from today so a rule created/updated mid-day can still fire today
  let candidate = after.toISOString().slice(0, 10)
  if (candidate < schedule.startDate) candidate = schedule.startDate

  for (let i = 0; i < 400; i++) {
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
    case 'specific_date':
      return `Monthly on day ${schedule.specificDate ?? 1}`
    case 'interval':
      return `Every ${schedule.intervalDays ?? 1} day(s)`
    default:
      return schedule.frequency
  }
}
