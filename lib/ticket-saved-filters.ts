export const SAVED_FILTERS_CHANGED_EVENT = 'deskteam-saved-ticket-filters-changed'

export type SavedTicketFilterPreset = {
  id: string
  name: string
  /** Query string without leading `?` */
  query: string
  isDefault?: boolean
}

/** Views before they lived in the database: read once to move them over. */
const LEGACY_STORAGE_KEY = 'deskteam-ticket-filter-presets-by-user'
/** Copy of the database list, so the bar next to search shows up before the request finishes. */
const CACHE_KEY = 'deskteam-ticket-filter-presets-cache'
const MIGRATED_PREFIX = 'deskteam-ticket-filter-presets-migrated:'

type FilterMap = Record<string, SavedTicketFilterPreset[]>

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeCache(userId: string, list: SavedTicketFilterPreset[]) {
  try {
    const map = readJson<FilterMap>(CACHE_KEY, {})
    map[userId] = list
    localStorage.setItem(CACHE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SAVED_FILTERS_CHANGED_EVENT))
}

/** What is known right now (the cached copy); call refreshSavedTicketFilterPresets to bring it up to date. */
export function loadSavedTicketFilterPresets(userId: string): SavedTicketFilterPreset[] {
  if (!userId) return []
  return readJson<FilterMap>(CACHE_KEY, {})[userId] ?? []
}

/** Loads the person's views from the server, moves any old browser-only views over once, and tells listeners. */
export async function refreshSavedTicketFilterPresets(userId: string): Promise<SavedTicketFilterPreset[]> {
  if (!userId) return []
  try {
    const res = await fetch('/api/ticket-filters', { credentials: 'include' })
    if (!res.ok) return loadSavedTicketFilterPresets(userId)
    let list = ((await res.json()) as { filters?: SavedTicketFilterPreset[] }).filters ?? []

    const flag = MIGRATED_PREFIX + userId
    if (localStorage.getItem(flag) !== '1') {
      const legacy = readJson<FilterMap>(LEGACY_STORAGE_KEY, {})[userId] ?? []
      if (list.length === 0) {
        for (const p of legacy.slice(0, 10)) {
          await fetch('/api/ticket-filters', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: p.name, query: p.query }),
          }).catch(() => {})
        }
        if (legacy.length) {
          const again = await fetch('/api/ticket-filters', { credentials: 'include' })
          if (again.ok) list = ((await again.json()) as { filters?: SavedTicketFilterPreset[] }).filters ?? list
        }
      }
      localStorage.setItem(flag, '1')
    }

    writeCache(userId, list)
    notifyChanged()
    return list
  } catch {
    return loadSavedTicketFilterPresets(userId)
  }
}

export async function addSavedTicketFilterPreset(
  userId: string,
  name: string,
  query: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Name is required' }
  if (!userId) return { ok: false, error: 'Not signed in' }
  try {
    const res = await fetch('/api/ticket-filters', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, query }),
    })
    if (!res.ok) return { ok: false, error: ((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not save' }
  } catch {
    return { ok: false, error: 'Could not save' }
  }
  await refreshSavedTicketFilterPresets(userId)
  return { ok: true }
}

export async function removeSavedTicketFilterPreset(userId: string, presetId: string): Promise<void> {
  await fetch(`/api/ticket-filters/${presetId}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  await refreshSavedTicketFilterPresets(userId)
}

/** Makes this view open first on the tickets page; pass null as the id to have no default. */
export async function setDefaultTicketFilterPreset(userId: string, presetId: string, isDefault: boolean): Promise<void> {
  await fetch(`/api/ticket-filters/${presetId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_default: isDefault }),
  }).catch(() => {})
  await refreshSavedTicketFilterPresets(userId)
}
