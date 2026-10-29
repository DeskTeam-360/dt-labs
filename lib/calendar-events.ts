export const CALENDAR_EVENT_TYPES = ['birthday', 'holiday', 'leave', 'duty', 'event'] as const
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]

export const CALENDAR_TYPE_META: Record<CalendarEventType, { label: string; color: string }> = {
  birthday: { label: 'Birthday', color: 'magenta' },
  holiday: { label: 'Holiday', color: 'red' },
  leave: { label: 'Leave', color: 'orange' },
  duty: { label: 'Duty', color: 'geekblue' },
  event: { label: 'Event', color: 'default' },
}

export type CalendarEventOut = {
  id: string
  type: CalendarEventType
  title: string
  /** The day of this occurrence (a yearly event is placed in the requested year) */
  start_date: string
  end_date: string
  user_id: string | null
  user_name: string | null
  user_email?: string | null
  repeat_yearly: boolean
  notes: string | null
  /** Already sent to the caller's own Google Calendar */
  synced?: boolean
  /** The stored first date, used when editing */
  origin_start: string
  origin_end: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Yearly events carry their first date; this puts them in `year` (Feb 29 falls back to Feb 28 in other years). */
export function placeInYear(startYmd: string, endYmd: string, year: number): { start: string; end: string } {
  const move = (ymd: string, y: number) => {
    const [, m, d] = ymd.split('-').map(Number)
    const day = m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 28 : d
    return `${y}-${pad(m)}-${pad(day)}`
  }
  const sy = Number(startYmd.slice(0, 4))
  const ey = Number(endYmd.slice(0, 4))
  return { start: move(startYmd, year), end: move(endYmd, year + (ey - sy)) }
}
