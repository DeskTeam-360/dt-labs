/** Shared parsing & column helpers for recap snapshot payload tables (settings + customer time report preview). */

export type RecapRoleBlock = {
  position: string
  time_used_seconds: number
  team_members_with_role: number
  time_available_seconds: number
  time_left_over_seconds: number
  pct_used: number | null
}

export type RecapTaskByRole = { position: string; available_tasks: number }

export const RECAP_HDR_H = ' (H)'

export function recapHours2(sec: unknown): string {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : 0
  return (n / 3600).toFixed(2)
}

export function recapFormatIntCount(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return String(Math.trunc(n))
}

export function recapFormatHoursFromSeconds(sec: unknown): string {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : 0
  const h = n / 3600
  return `${h.toFixed(2)} h`
}

export function recapParseRoles(payload: Record<string, unknown>): RecapRoleBlock[] {
  const raw = payload.by_position
  if (!Array.isArray(raw)) return []
  const out: RecapRoleBlock[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    out.push({
      position: String(o.position ?? ''),
      time_used_seconds: Number(o.time_used_seconds) || 0,
      team_members_with_role: Number(o.team_members_with_role) || 0,
      time_available_seconds: Number(o.time_available_seconds) || 0,
      time_left_over_seconds: Number(o.time_left_over_seconds) || 0,
      pct_used: o.pct_used === null || o.pct_used === undefined ? null : Number(o.pct_used),
    })
  }
  return out
}

export function recapGetRole(payload: Record<string, unknown>, position: string): RecapRoleBlock | null {
  return recapParseRoles(payload).find((r) => r.position === position) ?? null
}

export function recapParseTaskByRole(payload: Record<string, unknown>): RecapTaskByRole[] {
  const raw = payload.available_tasks_by_role
  if (!Array.isArray(raw)) return []
  const out: RecapTaskByRole[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    out.push({
      position: String(o.position ?? ''),
      available_tasks: Number(o.available_tasks) || 0,
    })
  }
  return out
}

export function recapRoleUsesSingleTimeUsedColumn(position: string): boolean {
  return position === 'Not in team'
}

function sortRolePositions(a: string, b: string): number {
  if (a === 'Not in team') return 1
  if (b === 'Not in team') return -1
  return a.localeCompare(b)
}

export function recapCollectRolePositionsFromPayloads(payloads: Record<string, unknown>[]): string[] {
  const pos = new Set<string>()
  for (const p of payloads) {
    for (const r of recapParseRoles(p)) {
      if (r.position) pos.add(r.position)
    }
  }
  return [...pos].sort(sortRolePositions)
}

export function recapCollectTaskRolePositionsFromPayloads(payloads: Record<string, unknown>[]): string[] {
  const taskPos = new Set<string>()
  for (const p of payloads) {
    for (const t of recapParseTaskByRole(p)) {
      if (t.position) taskPos.add(t.position)
    }
  }
  return [...taskPos].sort(sortRolePositions)
}

/** Label for first column from payload + fallback. */
export function recapTeamColumnLabelFromPayload(
  payload: Record<string, unknown>,
  fallback: string
): string {
  const names = Array.isArray(payload.team_names)
    ? (payload.team_names as unknown[]).map((x) => String(x)).filter(Boolean)
    : []
  if (names.length) return names.join(', ')
  return fallback || '—'
}
