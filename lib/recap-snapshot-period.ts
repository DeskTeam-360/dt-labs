import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

import {
  type CustomerTimeReportDatePresetKey,
  normalizeDatePreset,
  resolveDatePresetToRange,
} from '@/lib/customer-time-report-defaults'

dayjs.extend(isoWeek)

/** Calendar month: day 1 through last day of the same month/year. */
export function isFullCalendarMonthRange(start: Dayjs, end: Dayjs): boolean {
  if (!start?.isValid() || !end?.isValid()) return false
  if (!start.isSame(end, 'month') || !start.isSame(end, 'year')) return false
  return start.isSame(start.startOf('month'), 'day') && end.isSame(end.endOf('month'), 'day')
}

/** ISO week (Mon–Sun) as one continuous range. */
export function isFullIsoWeekRange(start: Dayjs, end: Dayjs): boolean {
  if (!start?.isValid() || !end?.isValid()) return false
  const ws = start.startOf('isoWeek')
  const we = start.endOf('isoWeek')
  return start.isSame(ws, 'day') && end.isSame(we, 'day')
}

export function classifyRecapPeriod(start: Dayjs, end: Dayjs): 'month' | 'week' | null {
  if (isFullCalendarMonthRange(start, end)) return 'month'
  if (isFullIsoWeekRange(start, end)) return 'week'
  return null
}

/** Same resolution as running the customer-time report (preset → concrete range). */
export function resolveReportRangeFromFormValues(v: {
  range?: [Dayjs, Dayjs] | null
  date_preset?: CustomerTimeReportDatePresetKey | null
}): { start: Dayjs; end: Dayjs } | null {
  const preset = normalizeDatePreset(v.date_preset)
  let range = v.range ?? null
  if (preset) {
    const r = resolveDatePresetToRange(preset, dayjs())
    if (r) range = [r.start, r.end]
  }
  if (!range?.[0] || !range?.[1]) return null
  if (!range[0].isValid() || !range[1].isValid()) return null
  return { start: range[0], end: range[1] }
}
