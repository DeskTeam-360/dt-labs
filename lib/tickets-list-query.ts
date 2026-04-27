import type { Dayjs } from 'dayjs'

/** Batas per halaman yang didukung UI daftar tiket. */
export const TICKETS_PAGE_LIMIT_OPTIONS = [50, 100, 200] as const
export type TicketsPageLimit = (typeof TICKETS_PAGE_LIMIT_OPTIONS)[number]

export function normalizeTicketsPageLimit(n: unknown): TicketsPageLimit {
  const x = typeof n === 'number' ? n : parseInt(String(n), 10)
  if (x === 100 || x === 200) return x
  return 50
}

export type TicketsListQueryKeyPayload = {
  isCustomer: boolean
  ticketsPageLimit: TicketsPageLimit
  filterCompanyIds: string
  filterStatus: string
  filterTypeIds: string
  filterTagIds: string
  filterPriorityIds: string
  filterVisibility: string
  filterTeamIds: string
  filterDateRangeKey: string
  filterDueDateRangeKey: string
  debouncedSearch: string
  filterTicketType: string
  lookupReady: boolean
}

function rangeKey(r: [Dayjs | null, Dayjs | null] | null): string {
  if (!r?.[0] || !r?.[1]) return ''
  return `${r[0].valueOf()}-${r[1].valueOf()}`
}

export function buildTicketsListQueryKey(
  ctx: Omit<TicketsListQueryKeyPayload, 'filterCompanyIds' | 'filterStatus' | 'filterTypeIds' | 'filterTagIds' | 'filterPriorityIds' | 'filterVisibility' | 'filterTeamIds' | 'filterDateRangeKey' | 'filterDueDateRangeKey' | 'debouncedSearch' | 'filterTicketType'> & {
    filterCompanyIds: string[]
    filterStatus: string[]
    filterTypeIds: number[]
    filterTagIds: string[]
    filterPriorityIds: number[]
    filterVisibility: string[]
    filterTeamIds: string[]
    filterDateRange: [Dayjs | null, Dayjs | null] | null
    filterDueDateRange: [Dayjs | null, Dayjs | null] | null
    debouncedSearch: string
    filterTicketType: 'spam' | 'trash' | null
  }
): readonly ['tickets', 'list', TicketsListQueryKeyPayload] {
  const payload: TicketsListQueryKeyPayload = {
    isCustomer: ctx.isCustomer,
    ticketsPageLimit: ctx.ticketsPageLimit,
    filterCompanyIds: [...ctx.filterCompanyIds].sort().join(','),
    filterStatus: [...ctx.filterStatus].sort().join(','),
    filterTypeIds: [...ctx.filterTypeIds].sort((a, b) => a - b).join(','),
    filterTagIds: [...ctx.filterTagIds].sort().join(','),
    filterPriorityIds: [...ctx.filterPriorityIds].sort((a, b) => a - b).join(','),
    filterVisibility: [...ctx.filterVisibility].sort().join(','),
    filterTeamIds: [...ctx.filterTeamIds].sort().join(','),
    filterDateRangeKey: rangeKey(ctx.filterDateRange),
    filterDueDateRangeKey: rangeKey(ctx.filterDueDateRange),
    debouncedSearch: ctx.debouncedSearch.trim(),
    filterTicketType: ctx.filterTicketType ?? '',
    lookupReady: ctx.lookupReady,
  }
  return ['tickets', 'list', payload] as const
}

export function ticketsListQueryKeyPrefix() {
  return ['tickets', 'list'] as const
}
