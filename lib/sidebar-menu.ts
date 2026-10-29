import {
  canAccessCustomerReportsFull,
  canAccessMyTeams,
  canAccessPoolReport,
  canAccessSettingsHub,
  canAccessTeamPool,
  canAccessTeams,
  canAccessTickets,
  canManageTeamAvailability,
} from '@/lib/auth-utils'

export type SidebarSection = 'work' | 'team' | 'customers' | 'settings'

export type SidebarItemDef = { key: string; label: string; section: SidebarSection }

export const SIDEBAR_SECTIONS: { key: SidebarSection; label: string }[] = [
  { key: 'work', label: 'Work' },
  { key: 'team', label: 'Team' },
  { key: 'customers', label: 'Customers' },
  { key: 'settings', label: 'Settings' },
]

/** Items that can never be hidden, so nobody loses the way back to the menu settings. */
export const ALWAYS_VISIBLE = ['/settings']

/** All items of the staff sidebar in their default order. */
const CATALOG: SidebarItemDef[] = [
  { key: '/dashboard', label: 'Dashboard', section: 'work' },
  { key: '/my-tickets', label: 'My Tickets', section: 'work' },
  { key: '/tickets', label: 'All tickets', section: 'work' },
  { key: '/tickets/latest', label: 'Latest tickets', section: 'work' },
  { key: '/team-pool', label: 'Team Pool', section: 'work' },
  { key: '/calendar', label: 'Calendar', section: 'work' },
  { key: '/reference', label: 'Reference', section: 'work' },
  { key: '/tickets?ticket_type=spam', label: 'Spam', section: 'work' },
  { key: '/tickets?ticket_type=trash', label: 'Trash', section: 'work' },
  { key: '/my-teams', label: 'E Report', section: 'team' },
  { key: '/team-report', label: 'Team Report', section: 'team' },
  { key: '/reports', label: 'Time Report', section: 'team' },
  { key: '/settings/team-availability', label: 'Team Availability', section: 'team' },
  { key: '/pool-report', label: 'Pool Report', section: 'customers' },
  { key: '/customer-time-report', label: 'Customer Report', section: 'customers' },
  { key: '/settings/customer-weekly-recap', label: 'Customer Weekly Recap', section: 'customers' },
  { key: '/new-customer-report', label: 'New Customer Report', section: 'customers' },
  { key: '/settings/company-log', label: 'Company Log', section: 'customers' },
  { key: '/settings/recap-snapshots', label: 'Recap Snapshots', section: 'customers' },
  { key: '/settings', label: 'Settings', section: 'settings' },
]

function allowed(key: string, r: string): boolean {
  switch (key) {
    case '/tickets':
    case '/tickets/latest':
    case '/tickets?ticket_type=spam':
    case '/tickets?ticket_type=trash':
    case '/reference':
      return canAccessTickets(r)
    case '/team-pool':
      return canAccessTeamPool(r)
    case '/my-teams':
      return canAccessMyTeams(r)
    case '/team-report':
    case '/reports':
      return canAccessTeams(r)
    case '/settings/team-availability':
      return canManageTeamAvailability(r)
    case '/pool-report':
      return canAccessPoolReport(r)
    case '/customer-time-report':
    case '/settings/customer-weekly-recap':
    case '/new-customer-report':
    case '/settings/company-log':
    case '/settings/recap-snapshots':
      return canAccessCustomerReportsFull(r)
    case '/settings':
      return canAccessSettingsHub(r)
    default:
      return true
  }
}

/** The items this role has in its sidebar, in default order. Customers have a fixed menu and are not customizable. */
export function sidebarItemsForRole(role: string | undefined | null): SidebarItemDef[] {
  const r = (role ?? '').toLowerCase()
  if (!r || r === 'customer') return []
  return CATALOG.filter((i) => allowed(i.key, r))
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
