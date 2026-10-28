import type { crawlSchedules } from '@/lib/db/schema'
import { normalizeSpecificDates } from '@/lib/recurring-ticket-schedule'

const FREQUENCIES = ['daily', 'weekdays', 'weekends', 'specific_days', 'specific_date', 'interval']

type ScheduleValues = Partial<typeof crawlSchedules.$inferInsert>

/** Reads and checks the schedule fields shared by create and update. Returns an error text when something is wrong. */
export function parseScheduleBody(b: Record<string, unknown>): { error: string } | { values: ScheduleValues } {
  const v: ScheduleValues = {}
  if (b.frequency !== undefined) {
    if (!FREQUENCIES.includes(String(b.frequency))) return { error: 'Invalid frequency' }
    v.frequency = String(b.frequency)
  }
  if (b.specific_days !== undefined) {
    const days = (Array.isArray(b.specific_days) ? b.specific_days : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    v.specificDays = [...new Set(days)]
  }
  if (b.specific_date !== undefined) v.specificDate = normalizeSpecificDates(b.specific_date)
  if (b.interval_days !== undefined) v.intervalDays = b.interval_days ? Math.max(1, Math.min(365, Number(b.interval_days))) : null
  if (b.time_of_day !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time_of_day))) return { error: 'Invalid time' }
    v.timeOfDay = String(b.time_of_day)
  }
  if (b.timezone !== undefined) v.timezone = String(b.timezone).slice(0, 64) || 'Asia/Jakarta'
  if (b.start_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.start_date))) return { error: 'Invalid start date' }
    v.startDate = String(b.start_date)
  }
  if (b.end_date !== undefined) v.endDate = b.end_date ? String(b.end_date) : null
  if (b.max_depth !== undefined) v.maxDepth = Math.max(1, Math.min(10, Number(b.max_depth) || 3))
  if (b.max_pages !== undefined) v.maxPages = Math.max(1, Math.min(1000, Number(b.max_pages) || 100))
  if (b.notify_emails !== undefined) {
    v.notifyEmails = (Array.isArray(b.notify_emails) ? b.notify_emails : []).map((e) => String(e).trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e))
  }
  if (b.is_active !== undefined) v.isActive = Boolean(b.is_active)
  return { values: v }
}
