import type { shifts } from '@/lib/db'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export type ShiftDto = {
  id: string
  title: string
  /** WIB, "HH:MM" */
  start: string
  /** WIB, "HH:MM" */
  end: string
  /** True when the end is earlier than the start (the shift runs past midnight). */
  crosses_midnight: boolean
  description: string | null
}

export function shiftToDto(r: typeof shifts.$inferSelect): ShiftDto {
  const start = String(r.startTime).slice(0, 5)
  const end = String(r.endTime).slice(0, 5)
  return { id: r.id, title: r.title, start, end, crosses_midnight: end < start, description: r.description ?? null }
}

/** Validate a create/update body. Times are WIB "HH:MM". */
export function parseShiftBody(body: unknown):
  | { title: string; start: string; end: string; description: string | null }
  | { error: string } {
  const b = (body ?? {}) as { title?: unknown; start?: unknown; end?: unknown; description?: unknown }
  const title = String(b.title ?? '').trim().slice(0, 100)
  if (!title) return { error: 'Title is required' }
  const start = String(b.start ?? '').trim()
  const end = String(b.end ?? '').trim()
  if (!HHMM.test(start) || !HHMM.test(end)) return { error: 'Start and end must be times like 07:00 (WIB)' }
  if (start === end) return { error: 'Start and end cannot be the same time' }
  const description = String(b.description ?? '').trim()
  return { title, start, end, description: description || null }
}
