import dayjs from 'dayjs'

import type { TicketSortField, TicketSortOrder } from '@/components/Tickets/types'

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
  search: 'search',
  view: 'view',
  sort: 'sort',
  order: 'order',
  sidebar: 'sidebar',
  /** Row classification: spam | trash (junk folders) */
  ticket_type: 'ticket_type',
  priority_ids: 'priority_ids',
} as const

export function hasUrlFilterParams(searchParams: URLSearchParams): boolean {
  if (searchParams.has(URL_PARAMS.ticket_type)) return true
  return Array.from(Object.values(URL_PARAMS)).some((key) => searchParams.has(key))
}

export interface ParsedUrlFilters {
  filterStatus: string[]
  filterTypeIds: number[]
  filterCompanyIds: string[]
  filterTagIds: string[]
  filterVisibility: string[]
  filterTeamIds: string[]
  filterDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  filterSearch: string
  viewMode: 'kanban' | 'list' | 'card' | 'roundrobin'
  sortBy: TicketSortField
  sortOrder: TicketSortOrder
  filterSidebarCollapsed: boolean
  filterTicketType: 'spam' | 'trash' | null
  filterPriorityIds: number[]
}

export function parseFiltersFromUrl(
  searchParams: URLSearchParams,
  opts?: { isCustomer?: boolean }
): ParsedUrlFilters | null {
  if (!hasUrlFilterParams(searchParams)) return null
  const isCustomer = opts?.isCustomer ?? false
  const split = (s: string | null) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])
  const status = split(searchParams.get(URL_PARAMS.status))
  const typeIds = split(searchParams.get(URL_PARAMS.type_ids))
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n))
  const priorityIds = split(searchParams.get(URL_PARAMS.priority_ids))
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n))
  const companyIds = split(searchParams.get(URL_PARAMS.company_ids))
  const tagIds = split(searchParams.get(URL_PARAMS.tag_ids))
  const visibilityRaw = split(searchParams.get(URL_PARAMS.visibility))
  const visibility = visibilityRaw
    .map((v) => (v === 'specific_users' ? 'private' : v))
    .filter((v, i, arr) => arr.indexOf(v) === i)
  const teamIds = split(searchParams.get(URL_PARAMS.team_ids))
  const dateFrom = searchParams.get(URL_PARAMS.date_from)
  const dateTo = searchParams.get(URL_PARAMS.date_to)
  let filterDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = null
  if (dateFrom && dateTo) {
    const d0 = dayjs(dateFrom)
    const d1 = dayjs(dateTo)
    if (d0.isValid() && d1.isValid()) filterDateRange = [d0, d1]
  }
  const viewRaw = searchParams.get(URL_PARAMS.view) as 'kanban' | 'list' | 'card' | 'roundrobin' | null
  const viewMode = ['kanban', 'list', 'card', 'roundrobin'].includes(viewRaw || '') ? viewRaw! : 'kanban'
  const sortRaw = searchParams.get(URL_PARAMS.sort)
  const sortBy = (
    ['id', 'title', 'priority', 'due_date', 'updated_at', 'created_at', 'company'] as const
  ).includes(sortRaw as TicketSortField)
    ? (sortRaw as TicketSortField)
    : 'updated_at'
  const orderRaw = searchParams.get(URL_PARAMS.order)
  const sortOrder: TicketSortOrder = orderRaw === 'asc' || orderRaw === 'desc' ? orderRaw : 'desc'
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
    filterPriorityIds: priorityIds,
    filterCompanyIds: companyIds,
    filterTagIds: tagIds,
    filterVisibility: inJunkFolder ? [] : visibility,
    filterTeamIds: teamIds,
    filterDateRange,
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
  filterPriorityIds?: number[]
  filterCompanyIds: string[]
  filterTagIds: string[]
  filterVisibility: string[]
  filterTeamIds: string[]
  filterDateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  filterSearch: string
  viewMode: string
  sortBy: string
  sortOrder: string
  filterSidebarCollapsed: boolean
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
  if ((state.filterPriorityIds?.length ?? 0) > 0)
    p.set(URL_PARAMS.priority_ids, state.filterPriorityIds!.join(','))
  if (state.filterCompanyIds.length > 0) p.set(URL_PARAMS.company_ids, state.filterCompanyIds.join(','))
  if (state.filterTagIds.length > 0) p.set(URL_PARAMS.tag_ids, state.filterTagIds.join(','))
  if (state.filterVisibility.length > 0) p.set(URL_PARAMS.visibility, state.filterVisibility.join(','))
  if (state.filterTeamIds.length > 0) p.set(URL_PARAMS.team_ids, state.filterTeamIds.join(','))
  if (state.filterDateRange?.[0] && state.filterDateRange?.[1]) {
    p.set(URL_PARAMS.date_from, state.filterDateRange[0].toISOString())
    p.set(URL_PARAMS.date_to, state.filterDateRange[1].toISOString())
  }
  if (state.filterSearch.trim()) p.set(URL_PARAMS.search, state.filterSearch.trim())
  if (!inJunk && state.viewMode && state.viewMode !== 'kanban') p.set(URL_PARAMS.view, state.viewMode)
  if (state.sortBy && state.sortBy !== 'updated_at') p.set(URL_PARAMS.sort, state.sortBy)
  if (state.sortOrder && state.sortOrder !== 'desc') p.set(URL_PARAMS.order, state.sortOrder)
  if (!state.filterSidebarCollapsed) p.set(URL_PARAMS.sidebar, '0')
  return p.toString()
}
