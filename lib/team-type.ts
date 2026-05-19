/** Stored as lowercase `varchar` on `teams.type`; labels are UI-only. */
export const TEAM_VISIBILITY_VALUES = ['public', 'private'] as const
export type TeamVisibilityType = (typeof TEAM_VISIBILITY_VALUES)[number]

export const TEAM_VISIBILITY_OPTIONS: ReadonlyArray<{ value: TeamVisibilityType; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

/** Accept case-insensitive input; returns canonical value or null if unknown / empty. */
export function parseTeamVisibility(raw: string | null | undefined): TeamVisibilityType | null {
  if (raw == null || typeof raw !== 'string') return null
  const n = raw.trim().toLowerCase()
  if (n === 'public' || n === 'private') return n
  return null
}

export function normalizeTeamVisibilityBody(raw: unknown): TeamVisibilityType | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return null
  return parseTeamVisibility(raw)
}

/** Display: canonical labels, or legacy raw string from DB when not public/private. */
export function formatTeamVisibilityLabel(raw: string | null | undefined): string {
  const v = parseTeamVisibility(raw)
  if (v === 'public') return 'Public'
  if (v === 'private') return 'Private'
  const s = typeof raw === 'string' ? raw.trim() : ''
  return s.length > 0 ? s : '—'
}
