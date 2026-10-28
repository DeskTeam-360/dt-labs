import { canAccessMyTeams, canAccessSettingsHub, canAccessTeams, canAccessTickets } from '@/lib/auth-utils'

export type SidebarItemDef = { key: string; label: string }

/** Items that can never be hidden, so nobody loses the way back to the menu settings. */
export const ALWAYS_VISIBLE = ['/settings']

/** All items of the staff sidebar in their default order. */
const CATALOG: SidebarItemDef[] = [
  { key: '/dashboard', label: 'Dashboard' },
  { key: '/tickets', label: 'All tickets' },
  { key: '/team-pool', label: 'Team Pool' },
  { key: '/tickets/latest', label: 'Latest tickets' },
  { key: '/tickets?ticket_type=spam', label: 'Spam' },
  { key: '/tickets?ticket_type=trash', label: 'Trash' },
  { key: '/reference', label: 'Reference' },
  { key: '/my-teams', label: 'E Report' },
  { key: '/team-report', label: 'Team Report' },
  { key: '/settings', label: 'Settings' },
]

/** The items this role has in its sidebar, in default order. Customers have a fixed menu and are not customizable. */
export function sidebarItemsForRole(role: string | undefined | null): SidebarItemDef[] {
  const r = (role ?? '').toLowerCase()
  if (!r || r === 'customer') return []
  return CATALOG.filter((i) => {
    switch (i.key) {
      case '/tickets':
      case '/tickets/latest':
      case '/tickets?ticket_type=spam':
      case '/tickets?ticket_type=trash':
      case '/reference':
        return canAccessTickets(r)
      case '/team-pool':
        return r === 'admin'
      case '/my-teams':
        return canAccessTickets(r) && canAccessMyTeams(r)
      case '/team-report':
        return canAccessTickets(r) && canAccessTeams(r)
      case '/settings':
        return canAccessSettingsHub(r)
      default:
        return true
    }
  })
}

export type MenuPreferences = { order: string[]; hidden: string[]; locked: string[] }

/**
 * Applies a person's order and hidden items to the menu keys they have.
 * Locked and always-visible items stay; items the person never placed keep their default spot after the ones they did.
 */
export function applyMenuPreferences<T extends { key?: string | number | null }>(items: T[], prefs: MenuPreferences): T[] {
  const stay = new Set([...prefs.locked, ...ALWAYS_VISIBLE])
  const hidden = new Set(prefs.hidden.filter((k) => !stay.has(k)))
  const pos = new Map(prefs.order.map((k, i) => [k, i]))
  const visible = items.filter((i) => !hidden.has(String(i.key)))
  const defaultIndex = new Map(items.map((i, n) => [String(i.key), n]))
  return [...visible].sort((a, b) => {
    const pa = pos.get(String(a.key))
    const pb = pos.get(String(b.key))
    if (pa != null && pb != null) return pa - pb
    if (pa != null) return -1
    if (pb != null) return 1
    return (defaultIndex.get(String(a.key)) ?? 0) - (defaultIndex.get(String(b.key)) ?? 0)
  })
}
