import dayjs, { type Dayjs } from 'dayjs'

export type StoppedTimeSession = {
  ticket_id: number
  start_time: string
  stop_time: string | null
  duration_seconds: number | null
}

export type HourlyActivityRow = {
  hour: number
  label: string
  minutes: number
  tickets: number
}

/** Per-hour overlap: minutes logged + distinct tickets active in that hour (local day). */
export function buildHourlyActivity(
  selectedDay: Dayjs,
  stoppedSessions: StoppedTimeSession[],
  activeSessions: Array<{ ticket_id: number; start_time: string }>
): HourlyActivityRow[] {
  const dayStart = selectedDay.startOf('day').valueOf()
  const dayEnd = selectedDay.endOf('day').valueOf()
  const now = dayjs().valueOf()
  if (dayStart > now) {
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      minutes: 0,
      tickets: 0,
    }))
  }

  type Clip = { start: number; end: number; ticketId: number }
  const clips: Clip[] = []

  for (const s of stoppedSessions) {
    if (!s.stop_time) continue
    const start = dayjs(s.start_time).valueOf()
    const end = dayjs(s.stop_time).valueOf()
    const a = Math.max(start, dayStart)
    const b = Math.min(end, dayEnd)
    if (b > a) clips.push({ start: a, end: b, ticketId: s.ticket_id })
  }

  for (const a of activeSessions) {
    const start = dayjs(a.start_time).valueOf()
    const end = now
    const a0 = Math.max(start, dayStart)
    const b0 = Math.min(end, dayEnd)
    if (b0 > a0) clips.push({ start: a0, end: b0, ticketId: a.ticket_id })
  }

  const rows: HourlyActivityRow[] = []
  for (let h = 0; h < 24; h++) {
    const hStart = dayjs(selectedDay).startOf('day').add(h, 'hour').valueOf()
    const hEnd = hStart + 60 * 60 * 1000
    const ticketSet = new Set<number>()
    let totalMs = 0
    for (const c of clips) {
      const segStart = Math.max(c.start, hStart)
      const segEnd = Math.min(c.end, hEnd)
      if (segEnd > segStart) {
        totalMs += segEnd - segStart
        ticketSet.add(c.ticketId)
      }
    }
    rows.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      minutes: Math.round(totalMs / 60000),
      tickets: ticketSet.size,
    })
  }
  return rows
}
