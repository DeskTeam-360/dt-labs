const SLUG_RE = /^[a-z0-9_]{1,64}$/

/** Lowercase slug: letters, digits, underscore only; max 64 chars. */
export function normalizeJobTypeSlug(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const s = raw.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  if (!s || s.length > 64) return null
  return SLUG_RE.test(s) ? s : null
}

export function normalizeJobTypeTitle(raw: unknown): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t || t.length > 255) return null
  return t
}

export function parseJobTypeSortOrder(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.max(0, n) : fallback
}
