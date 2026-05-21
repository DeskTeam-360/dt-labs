import dayjs from 'dayjs'

import type { TicketSortField, TicketSortOrder } from '@/components/ticket/list/types'

/** URL param keys - used for shareable filter links and saved presets */
export const URL_PARAMS = {
  status: 'status',
  type_ids: 'type_ids',
  company_ids: 'company_ids',
  tag_ids: 'tag_ids',
  visibility: 'visibility',
  team_ids: 'team_ids',
  date_from: 'date_from',
  date_to: 'date_to',
  due_date_from: 'due_date_from',
  due_date_to: 'due_date_to',
  search: 'search',
  view: 'view',
  sort: 'sort',
  order: 'order',
  sidebar: 'sidebar',
  /** Row classification: spam | trash (junk folders) */
  ticket_type: 'ticket_type',
} as const

/** UI display preferences - not synced to the URL (except junk folders `view=card`) so changing view doesn't trigger `router.replace` and re-fetch. */
const URL_UI_ONLY_KEYS = new Set<string>([
  URL_PARAMS.sidebar,
  URL_PARAMS.view,
  URL_PARAMS.sort,
  URL_PARAMS.order,
  /** Visibility filter removed from UI; legacy param ignored so old bookmarks don't lock the query. */
  URL_PARAMS.visibility,
])

/** True if the URL has params that affect the ticket list query (not view/sort/order/sidebar alone). */
export function hasUrlFilterParams(searchParams: URLSearchParams): boolean {
  if (searchParams.has(URL_PARAMS.ticket_type)) return true
  return Array.from(Object.values(URL_PARAMS)).some(
    (key) => !URL_UI_ONLY_KEYS.has(key) && searchParams.has(key)
  )
}

/** True if any known ticket URL param is present (initial parse / bookmarks). */
export function canParseTicketsUrl(searchParams: URLSearchParams): boolean {
  return Array.from(Object.values(URL_PARAMS)).some((key) => searchParams.has(key))
}

/** Read sidebar open state from URL (`sidebar=0` = expanded). `null` = param absent. */
export function parseSidebarCollapsedFromUrl(searchParams: URLSearchParams): boolean | null {
  if (!searchParams.has(URL_PARAMS.sidebar)) return null
  return searchParams.get(URL_PARAMS.sidebar) === '0' ? false : true
}

export interface ParsedUrlFilters {
  filterStatus: string[]
  filterTypeIds: number[]
  filterCompanyIds: string[]
  filterTagIds: string[]
  filterTeamIds: string[]
  filterDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  filterDueDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  filterSearch: string
  viewMode: 'kanban' | 'list' | 'card' | 'roundrobin'
  sortBy: TicketSortField
  sortOrder: TicketSortOrder
  filterSidebarCollapsed: boolean
  filterTicketType: 'spam' | 'trash' | null
}

export function parseFiltersFromUrl(
  searchParams: URLSearchParams,
  opts?: { isCustomer?: boolean }
): ParsedUrlFilters | null {
  if (!canParseTicketsUrl(searchParams)) return null
  const isCustomer = opts?.isCustomer ?? false
  const split = (s: string | null) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])
  const status = split(searchParams.get(URL_PARAMS.status))
  const typeIds = split(searchParams.get(URL_PARAMS.type_ids))
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n))
  const companyIds = split(searchParams.get(URL_PARAMS.company_ids))
  const tagIds = split(searchParams.get(URL_PARAMS.tag_ids))
  const teamIds = split(searchParams.get(URL_PARAMS.team_ids))
  const dateFrom = searchParams.get(URL_PARAMS.date_from)
  const dateTo = searchParams.get(URL_PARAMS.date_to)
  let filterDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = null
  if (dateFrom && dateTo) {
    const d0 = dayjs(dateFrom)
    const d1 = dayjs(dateTo)
    if (d0.isValid() && d1.isValid()) filterDateRange = [d0, d1]
  }
  const dueFrom = searchParams.get(URL_PARAMS.due_date_from)
  const dueTo = searchParams.get(URL_PARAMS.due_date_to)
  let filterDueDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = null
  if (dueFrom && dueTo) {
    const d0 = dayjs(dueFrom)
    const d1 = dayjs(dueTo)
    if (d0.isValid() && d1.isValid()) filterDueDateRange = [d0, d1]
  }
  const viewRaw = searchParams.get(URL_PARAMS.view) as 'kanban' | 'list' | 'card' | 'roundrobin' | null
  const viewMode = ['kanban', 'list', 'card', 'roundrobin'].includes(viewRaw || '') ? viewRaw! : 'kanban'
  /** List order is always ascending priority per company; sort/order params are ignored. */
  const sortBy = 'priority' as TicketSortField
  const sortOrder = 'asc' as TicketSortOrder
  const sidebarRaw = searchParams.get(URL_PARAMS.sidebar)
  const filterSidebarCollapsed = sidebarRaw === '0' ? false : true

  const ticketTypeRaw = searchParams.get(URL_PARAMS.ticket_type)?.trim().toLowerCase()
  const filterTicketType: 'spam' | 'trash' | null =
    ticketTypeRaw === 'spam' || ticketTypeRaw === 'trash' ? ticketTypeRaw : null
  const inJunkFolder = filterTicketType !== null

  const junkViewMode: 'kanban' | 'list' | 'card' | 'roundrobin' = 'card'
  const resolvedViewMode = inJunkFolder ? junkViewMode : viewMode

  return {
    filterStatus: inJunkFolder
      ? []
      : status.length > 0
        ? status
        : isCustomer
          ? []
          : [],
    filterTypeIds: typeIds,
    filterCompanyIds: companyIds,
    filterTagIds: tagIds,
    filterTeamIds: teamIds,
    filterDateRange,
    filterDueDateRange,
    filterSearch: searchParams.get(URL_PARAMS.search)?.trim() ?? '',
    viewMode: resolvedViewMode,
    sortBy,
    sortOrder,
    filterSidebarCollapsed,
    filterTicketType,
  }
}

export function buildSearchStringFromFilters(state: {
  filterStatus: string[]
  filterTypeIds: number[]
  filterCompanyIds: string[]
  filterTagIds: string[]
  filterTeamIds: string[]
  filterDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  filterDueDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  filterSearch: string
  viewMode: string
  filterTicketType?: 'spam' | 'trash' | null
}): string {
  const p = new URLSearchParams()
  const inJunk = state.filterTicketType === 'spam' || state.filterTicketType === 'trash'
  if (inJunk) {
    p.set(URL_PARAMS.ticket_type, state.filterTicketType!)
    p.set(URL_PARAMS.view, 'card')
  }
  if (state.filterStatus.length > 0) p.set(URL_PARAMS.status, state.filterStatus.join(','))
  if (state.filterTypeIds.length > 0) p.set(URL_PARAMS.type_ids, state.filterTypeIds.join(','))
  if (state.filterCompanyIds.length > 0) p.set(URL_PARAMS.company_ids, state.filterCompanyIds.join(','))
  if (state.filterTagIds.length > 0) p.set(URL_PARAMS.tag_ids, state.filterTagIds.join(','))
  if (state.filterTeamIds.length > 0) p.set(URL_PARAMS.team_ids, state.filterTeamIds.join(','))
  if (state.filterDateRange?.[0] && state.filterDateRange?.[1]) {
    p.set(URL_PARAMS.date_from, state.filterDateRange[0].toISOString())
    p.set(URL_PARAMS.date_to, state.filterDateRange[1].toISOString())
  }
  if (state.filterDueDateRange?.[0] && state.filterDueDateRange?.[1]) {
    p.set(URL_PARAMS.due_date_from, state.filterDueDateRange[0].toISOString())
    p.set(URL_PARAMS.due_date_to, state.filterDueDateRange[1].toISOString())
  }
  if (state.filterSearch.trim()) p.set(URL_PARAMS.search, state.filterSearch.trim())
  /** Ticket order is not persisted in the URL - always ascending priority via the API. */
  /** Sidebar open/closed is kept in localStorage only - syncing it to the URL triggered full URL re-parse and reset filters. */
  return p.toString()
}
