export const SAVED_FILTERS_CHANGED_EVENT = 'deskteam-saved-ticket-filters-changed'

export type SavedTicketFilterPreset = {
  id: string
  name: string
  /** Query string without leading `?` */
  query: string
}

const STORAGE_KEY = 'deskteam-ticket-filter-presets-by-user'
const MAX_PRESETS_PER_USER = 10

function readMap(): Record<string, SavedTicketFilterPreset[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return {}
    return p as Record<string, SavedTicketFilterPreset[]>
  } catch {
    return {}
  }
}

function writeMap(m: Record<string, SavedTicketFilterPreset[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
  } catch {
    // ignore quota / private mode
  }
}

function notifyChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAVED_FILTERS_CHANGED_EVENT))
  }
}

export function loadSavedTicketFilterPresets(userId: string): SavedTicketFilterPreset[] {
  if (!userId) return []
  return readMap()[userId] ?? []
}

export function addSavedTicketFilterPreset(
  userId: string,
  name: string,
  query: string
): { ok: true } | { ok: false; error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Name is required' }
  if (!userId) return { ok: false, error: 'Not signed in' }
  const map = readMap()
  const list = map[userId] ?? []
  if (list.length >= MAX_PRESETS_PER_USER) {
    return { ok: false, error: `You can save up to ${MAX_PRESETS_PER_USER} views` }
  }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  map[userId] = [...list, { id, name: trimmed, query: query.trim() }]
  writeMap(map)
  notifyChanged()
  return { ok: true }
}

export function removeSavedTicketFilterPreset(userId: string, presetId: string): void {
  const map = readMap()
  const list = map[userId]
  if (!list?.length) return
  map[userId] = list.filter((p) => p.id !== presetId)
  writeMap(map)
  notifyChanged()
}
