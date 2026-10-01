import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

export type SessionLike = {
  userId: string
  startTime: Date
  stopTime: Date | null
  durationSeconds: number | null
  durationAdjustment: number | null
}

const HOUR_MS = 3600 * 1000

function empty24(): number[] {
  return Array.from({ length: 24 }, () => 0)
}

/**
 * Seconds of reported time overlapping [dayStart, dayEnd], attributed across the viewer's local clock hours (0–23).
 * `dayStart` must be the viewer's local midnight (sent by the client); hour 0 starts there.
 * Running sessions use `now` as stop for wall-clock span; reported seconds scale to overlap.
 */
export function accumulateSession(
  teamHourly: number[],
  memberHourly: Map<string, number[]>,
  memberTotals: Map<string, number>,
  s: SessionLike,
  dayStart: Date,
  dayEnd: Date,
  now: Date
) {
  const start = s.startTime
  const endWall = s.stopTime ?? now
  const rep =
    reportedDurationSeconds({
      durationSeconds: s.durationSeconds,
      durationAdjustment: s.durationAdjustment,
    }) ?? 0

  const overlapStartMs = Math.max(start.getTime(), dayStart.getTime())
  const overlapEndMs = Math.min(endWall.getTime(), dayEnd.getTime())
  if (overlapEndMs <= overlapStartMs) return

  const wallSec = Math.max(0.001, (endWall.getTime() - start.getTime()) / 1000)
  const overlapSec = (overlapEndMs - overlapStartMs) / 1000
  const attributed = rep * (overlapSec / wallSec)

  // Hours are counted from the viewer's local midnight (`dayStart`), not the server's timezone.
  const originMs = dayStart.getTime()
  let cursor = overlapStartMs
  while (cursor < overlapEndMs) {
    const hoursFromOrigin = Math.floor((cursor - originMs) / HOUR_MS)
    const h = ((hoursFromOrigin % 24) + 24) % 24
    const nextHour = originMs + (hoursFromOrigin + 1) * HOUR_MS
    const segEnd = Math.min(overlapEndMs, nextHour)
    const segDur = (segEnd - cursor) / 1000
    const slice = attributed * (segDur / overlapSec)
    teamHourly[h] += slice
    const mb = memberHourly.get(s.userId) ?? empty24()
    mb[h] += slice
    memberHourly.set(s.userId, mb)
    cursor = segEnd
  }

  memberTotals.set(s.userId, (memberTotals.get(s.userId) ?? 0) + attributed)
}

export function roundHourly(bins: number[]): number[] {
  return bins.map((x) => Math.round(x * 100) / 100)
}
