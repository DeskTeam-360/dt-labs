import dayjs from 'dayjs'

/**
 * Supported template variables for recurring ticket title/description:
 *
 * {{ this_month_name }}  → e.g. "September"
 * {{ prev_month_name }}  → e.g. "August"
 * {{ next_month_name }}  → e.g. "October"
 *
 * {{ this_day_name }}    → e.g. "Thursday"
 * {{ prev_day_name }}    → e.g. "Wednesday"
 * {{ next_day_name }}    → e.g. "Friday"
 *
 * {{ this_date }}        → e.g. "2026-09-25"
 * {{ prev_date }}        → e.g. "2026-09-24"
 * {{ next_date }}        → e.g. "2026-09-26"
 *
 * {{ this_year }}        → e.g. "2026"
 * {{ this_month_number }} → e.g. "9"
 * {{ this_day_number }}   → e.g. "25"
 */
export function applyRecurringTicketTemplate(text: string, at: Date = new Date()): string {
  const d = dayjs(at)
  const prev = d.subtract(1, 'day')
  const next = d.add(1, 'day')
  const prevMonth = d.subtract(1, 'month')
  const nextMonth = d.add(1, 'month')

  const vars: Record<string, string> = {
    this_month_name: d.format('MMMM'),
    prev_month_name: prevMonth.format('MMMM'),
    next_month_name: nextMonth.format('MMMM'),

    this_day_name: d.format('dddd'),
    prev_day_name: prev.format('dddd'),
    next_day_name: next.format('dddd'),

    this_date: d.format('YYYY-MM-DD'),
    prev_date: prev.format('YYYY-MM-DD'),
    next_date: next.format('YYYY-MM-DD'),

    this_year: d.format('YYYY'),
    this_month_number: String(d.month() + 1),
    this_day_number: String(d.date()),
  }

  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match
  })
}
