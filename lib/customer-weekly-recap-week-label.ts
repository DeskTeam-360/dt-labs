import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isoWeek)

/**
 * Column label like "March W1", "April W1":
 * Wn = nth Monday-based week within the calendar month (first Monday in the month = W1),
 * month name comes from that ISO week's Monday date.
 */
export function weekColumnHeaderMonthW(monday: Dayjs): string {
  const m = monday.startOf('day')
  const y = m.year()
  const monthIndex = m.month()

  let firstMon = dayjs(new Date(y, monthIndex, 1)).startOf('day')
  while (firstMon.month() === monthIndex && firstMon.isoWeekday() !== 1) {
    firstMon = firstMon.add(1, 'day')
  }
  if (firstMon.month() !== monthIndex) {
    return `${m.format('MMMM')} W1`
  }

  const days = m.diff(firstMon.startOf('day'), 'day')
  const n = Math.floor(days / 7) + 1
  return `${m.format('MMMM')} W${Math.max(1, n)}`
}
