'use client'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { usePathname, useRouter,useSearchParams } from 'next/navigation'
import { useCallback,useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export type TicketsDragStartHandler = (event: DragStartEvent) => void
export type TicketsDragEndHandler = (event: DragEndEvent) => Promise<void>
import { Form, message } from 'antd'
import dayjs from 'dayjs'

import type { ParsedUrlFilters } from '@/lib/ticket-filter-url'
import { buildSearchStringFromFilters, hasUrlFilterParams,parseFiltersFromUrl } from '@/lib/ticket-filter-url'

const FILTER_STORAGE_KEY = 'deskteam-tickets-filter'

interface StoredFilter {
  filterStatus?: string[] | null
  filterTypeId?: number | null
  filterTypeIds?: number[] | null
  filterCompanyId?: string | null
  filterCompanyIds?: string[] | null
  filterTagIds?: string[] | null
  filterVisibility?: string[] | null
  filterTeamId?: string | null
  filterTeamIds?: string[] | null
  filterDateRange?: [string | null, string | null] | null
  filterSearch?: string | null
  viewMode?: 'kanban' | 'list' | 'card' | 'roundrobin'
  filterSidebarCollapsed?: boolean
  sortBy?: TicketSortField | null
  sortOrder?: TicketSortOrder | null
  filterPriorityIds?: number[] | null
}

function loadFiltersFromStorage(): StoredFilter | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredFilter
    return parsed
  } catch {
    return null
  }
}

function saveFiltersToStorage(stored: StoredFilter) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // ignore
  }
}
import { resolveDefaultNewTicketStatusSlug } from '@/lib/ticket-default-status'
import { isTicketStatusInKanban, ticketStatusDisplayLabel } from '@/lib/ticket-status-kanban'
import { deleteFile,uploadTicketFileDraft } from '@/utils/storage'

import type { Team, TicketRecord, UserRecord } from './types'
import type { NewTicketAttachment } from './types'
import type { TicketStatusRecord } from './types'
import {
  DEFAULT_ALL_STATUS_COLUMNS,
  DEFAULT_ALL_STATUSES,
  DEFAULT_KANBAN_COLUMNS,
  type StatusColumn,
  type TicketSortField,
  type TicketSortOrder,
} from './types'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

function getInitialFilterStateFromStored(stored: StoredFilter | null, isCustomer = false): ParsedUrlFilters {
  const defaultStatus = isCustomer
    ? []
    : DEFAULT_KANBAN_COLUMNS.map((c) => c.id)
  return {
    filterStatus: (() => {
      if (stored && Array.isArray(stored.filterStatus)) {
        if (stored.filterStatus.length > 0) return stored.filterStatus
        return []
      }
      if (stored?.filterStatus && stored.filterStatus.length) return stored.filterStatus
      return defaultStatus
    })(),
    filterTypeIds: (() => {
      if (stored && 'filterTypeIds' in stored && Array.isArray(stored.filterTypeIds)) {
        return (stored.filterTypeIds as number[]).filter((n) => typeof n === 'number' && !isNaN(n))
      }
      if (stored?.filterTypeIds && stored.filterTypeIds.length) {
        return stored.filterTypeIds.filter((n) => typeof n === 'number' && !isNaN(n))
      }
      if (stored?.filterTypeId != null && typeof stored.filterTypeId === 'number' && !isNaN(stored.filterTypeId)) {
        return [stored.filterTypeId]
      }
      return []
    })(),
    filterCompanyIds: (() => {
      if (stored && 'filterCompanyIds' in stored && Array.isArray(stored.filterCompanyIds)) {
        return (stored.filterCompanyIds as string[]).map(String).filter(Boolean)
      }
      if (stored?.filterCompanyIds && stored.filterCompanyIds.length) {
        return stored.filterCompanyIds.map(String).filter(Boolean)
      }
      if (stored?.filterCompanyId) return [String(stored.filterCompanyId)]
      return []
    })(),
    filterTagIds: (() => {
      if (stored && 'filterTagIds' in stored && Array.isArray(stored.filterTagIds)) {
        return (stored.filterTagIds as string[]).map(String).filter(Boolean)
      }
      if (stored?.filterTagIds && stored.filterTagIds.length) {
        return stored.filterTagIds.map(String).filter(Boolean)
      }
      return []
    })(),
    filterPriorityIds: (() => {
      if (stored && 'filterPriorityIds' in stored && Array.isArray(stored.filterPriorityIds)) {
        return (stored.filterPriorityIds as number[]).filter((n) => typeof n === 'number' && !isNaN(n))
      }
      if (stored?.filterPriorityIds && stored.filterPriorityIds.length) {
        return stored.filterPriorityIds.filter((n) => typeof n === 'number' && !isNaN(n))
      }
      return []
    })(),
    filterVisibility: (() => {
      if (stored && 'filterVisibility' in stored && Array.isArray(stored.filterVisibility)) {
        return stored.filterVisibility.map(String).filter(Boolean)
      }
      if (stored?.filterVisibility && stored.filterVisibility.length) {
        return stored.filterVisibility.map(String).filter(Boolean)
      }
      return []
    })(),
    filterTeamIds: (() => {
      if (stored && 'filterTeamIds' in stored && Array.isArray(stored.filterTeamIds)) {
        return (stored.filterTeamIds as string[]).map(String).filter(Boolean)
      }
      if (stored?.filterTeamIds && stored.filterTeamIds.length) {
        return stored.filterTeamIds.map(String).filter(Boolean)
      }
      if (stored?.filterTeamId) return [String(stored.filterTeamId)]
      return []
    })(),
    filterDateRange: ((): [dayjs.Dayjs | null, dayjs.Dayjs | null] | null => {
      const dr = stored?.filterDateRange
      if (!dr || !dr[0] || !dr[1]) return null
      const d0 = dayjs(dr[0])
      const d1 = dayjs(dr[1])
      return d0.isValid() && d1.isValid() ? [d0, d1] : null
    })(),
    filterSearch: stored?.filterSearch ?? '',
    filterSidebarCollapsed: stored?.filterSidebarCollapsed ?? true,
    viewMode: (stored?.viewMode as 'kanban' | 'list' | 'card' | 'roundrobin') || 'kanban',
    sortBy: (stored?.sortBy as TicketSortField) || 'updated_at',
    sortOrder: (stored?.sortOrder as TicketSortOrder) || 'desc',
    filterTicketType: null,
  }
}

function getInitialViewModeCustomer(isCustomer: boolean, stored: StoredFilter | null): 'kanban' | 'list' | 'card' | 'roundrobin' {
  const storedMode = stored?.viewMode as 'kanban' | 'list' | 'card' | 'roundrobin'
  if (isCustomer && storedMode === 'roundrobin') return 'kanban'
  return storedMode || 'kanban'
}

export function useTicketsData(currentUserId: string, isCustomer = false) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  /**
   * SSR + first client render must match: never read localStorage synchronously here.
   * URL params → same on server & client; otherwise defaults from getInitialFilterStateFromStored(null).
   * LocalStorage is applied once after mount in useLayoutEffect (before paint / before passive effects).
   */
  const initialRef = useRef<{ state: ParsedUrlFilters; fromUrl: boolean } | null>(null)
  if (initialRef.current === null) {
    const fromUrl = parseFiltersFromUrl(searchParams, { isCustomer })
    if (fromUrl) {
      let viewMode = fromUrl.viewMode
      if (isCustomer && viewMode === 'roundrobin') viewMode = 'kanban'
      let filterTicketType = fromUrl.filterTicketType
      if (
        isCustomer &&
        (filterTicketType === 'spam' || filterTicketType === 'trash')
      ) {
        filterTicketType = null
      }
      initialRef.current = { state: { ...fromUrl, viewMode, filterTicketType }, fromUrl: true }
    } else {
      const state = getInitialFilterStateFromStored(null, isCustomer)
      const viewMode = getInitialViewModeCustomer(isCustomer, null)
      initialRef.current = { state: { ...state, viewMode }, fromUrl: false }
    }
  }
  const initialState = initialRef.current.state

  const lastKanbanSlugsRef = useRef<string[] | null>(null)
  const applyingFromUrlRef = useRef(false)
  const prevTicketsListSearchRef = useRef<string | null>(null)

  const [collapsed, setCollapsed] = useState(true)
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null)
  const [form] = Form.useForm()
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [ticketTypes, setTicketTypes] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
  const [ticketPriorities, setTicketPriorities] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; color?: string }>>([])
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; slug: string; color?: string }>>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  
  const [statusColumns, setStatusColumns] = useState<StatusColumn[]>([])
  const [lookupReady, setLookupReady] = useState(false)
  const [allStatusColumns, setAllStatusColumns] = useState<StatusColumn[]>(DEFAULT_ALL_STATUS_COLUMNS)
  const [allStatuses, setAllStatuses] = useState<Array<{ slug: string; title: string; is_active?: boolean }>>(
    DEFAULT_ALL_STATUSES
  )
  const [filterStatus, setFilterStatus] = useState<string[]>(initialState.filterStatus)
  const [filterTypeIds, setFilterTypeIds] = useState<number[]>(initialState.filterTypeIds)
  const [filterCompanyIds, setFilterCompanyIds] = useState<string[]>(initialState.filterCompanyIds)
  const [filterTagIds, setFilterTagIds] = useState<string[]>(initialState.filterTagIds)
  const [filterPriorityIds, setFilterPriorityIds] = useState<number[]>(initialState.filterPriorityIds ?? [])
  const [filterVisibility, setFilterVisibilityState] = useState<string[]>(initialState.filterVisibility)
  const [filterTeamIds, setFilterTeamIds] = useState<string[]>(initialState.filterTeamIds)
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(initialState.filterDateRange)
  const [filterSearch, setFilterSearch] = useState(initialState.filterSearch)
  const [submitting, setSubmitting] = useState(false)
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(initialState.filterSidebarCollapsed)
  const [sortBy, setSortBy] = useState<TicketSortField>(initialState.sortBy)
  const [sortOrder, setSortOrder] = useState<TicketSortOrder>(initialState.sortOrder)
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'card' | 'roundrobin'>(initialState.viewMode)
  const [filterTicketType, setFilterTicketType] = useState<'spam' | 'trash' | null>(
    initialState.filterTicketType ?? null
  )
  const [newTicketAttachments, setNewTicketAttachments] = useState<NewTicketAttachment[]>([])
  const [deletedTicketAttachmentIds, setDeletedTicketAttachmentIds] = useState<string[]>([])
  const [attachmentUploading, setAttachmentUploading] = useState(false)

  /** Server returns filtered data - no client-side filtering */
  const filteredTickets = tickets

  
  const columnsToShow = useMemo(() => {
    if (allStatusColumns.length === 0) return []
    if (filterStatus.length === 0) return allStatusColumns
    const allowed = new Set(filterStatus)
    return allStatusColumns.filter((c) => allowed.has(c.id))
  }, [filterStatus, allStatusColumns])

  const defaultKanbanStatusKey = useMemo(
    () => [...statusColumns.map((c) => c.id)].sort().join(','),
    [statusColumns]
  )

  const statusFilterIsRestrictive = useMemo(() => {
    if (statusColumns.length === 0) return false
    if (filterStatus.length === 0) return false
    if (
      isCustomer &&
      lookupReady &&
      allStatuses.length > 0 &&
      filterStatus.length === allStatuses.length &&
      allStatuses.every((s) => filterStatus.includes(s.slug))
    ) {
      return false
    }
    return [...filterStatus].sort().join(',') !== defaultKanbanStatusKey
  }, [filterStatus, defaultKanbanStatusKey, statusColumns.length, isCustomer, lookupReady, allStatuses])

  const hasActiveFilters =
    statusFilterIsRestrictive ||
    filterTypeIds.length > 0 ||
    filterCompanyIds.length > 0 ||
    filterTagIds.length > 0 ||
    filterVisibility.length > 0 ||
    filterTeamIds.length > 0 ||
    (filterDateRange != null && filterDateRange[0] != null && filterDateRange[1] != null) ||
    filterSearch.trim() !== '' ||
    filterTicketType != null ||
    filterPriorityIds.length > 0

  const clearFilters = useCallback(() => {
    setFilterTicketType(null)
    setFilterStatus(
      isCustomer && allStatuses.length > 0
        ? allStatuses.map((s) => s.slug)
        : statusColumns.map((c) => c.id)
    )
    setFilterTypeIds([])
    setFilterCompanyIds([])
    setFilterTagIds([])
    setFilterPriorityIds([])
    setFilterVisibilityState([])
    setFilterTeamIds([])
    setFilterDateRange(null)
    setFilterSearch('')
  }, [statusColumns, isCustomer, allStatuses])

  const setFilterVisibility = useCallback((v: string[]) => {
    setFilterVisibilityState(v ?? [])
  }, [])

  const fetchTickets = useCallback(async () => {
    const params = new URLSearchParams()
    const inJunkFolder =
      !isCustomer && (filterTicketType === 'spam' || filterTicketType === 'trash')
    if (inJunkFolder) params.set('ticket_type', filterTicketType!)
    if (!isCustomer) {
      if (filterCompanyIds.length > 0) params.set('company_ids', filterCompanyIds.join(','))
      if (filterVisibility.length > 0 && !inJunkFolder) params.set('visibility', filterVisibility.join(','))
      if (filterTeamIds.length > 0 && !inJunkFolder) params.set('team_ids', filterTeamIds.join(','))
    }
    if (filterTagIds.length > 0) params.set('tag_ids', filterTagIds.join(','))
    if (filterPriorityIds.length > 0) params.set('priority_ids', filterPriorityIds.join(','))
    /** Staff: always honor status filter. Customer: omit status param when still loading or when filter is "all statuses" (same as unrestricted list). */
    const customerShowsAllStatuses =
      isCustomer &&
      lookupReady &&
      allStatuses.length > 0 &&
      filterStatus.length === allStatuses.length &&
      allStatuses.every((s) => filterStatus.includes(s.slug))
    const sendStatusToApi =
      filterStatus.length > 0 &&
      !inJunkFolder &&
      (isCustomer ? lookupReady && !customerShowsAllStatuses : true)
    if (sendStatusToApi) params.set('status', filterStatus.join(','))
    if (filterTypeIds.length > 0) params.set('type_ids', filterTypeIds.join(','))
    if (filterDateRange?.[0] && filterDateRange?.[1]) {
      params.set('date_from', filterDateRange[0].startOf('day').toISOString())
      params.set('date_to', filterDateRange[1].endOf('day').toISOString())
    }
    if (filterSearch.trim()) params.set('search', filterSearch.trim())
    params.set('limit', '500')

    const qs = params.toString()
    const url = qs ? `/api/tickets?${qs}` : '/api/tickets'

    setLoading(true)
    try {
      const data = await apiFetch<TicketRecord[]>(url)
      setTickets(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch tickets')
    } finally {
      setLoading(false)
    }
  }, [
    isCustomer,
    filterCompanyIds,
    filterStatus,
    filterTypeIds,
    filterTagIds,
    filterVisibility,
    filterTeamIds,
    filterDateRange,
    filterSearch,
    filterTicketType,
    filterPriorityIds,
    lookupReady,
    allStatuses,
  ])

  const [userCompanyId, setUserCompanyId] = useState<string | null>(null)
  const [userTeamIds, setUserTeamIds] = useState<string[]>([])

  const storageHydratedRef = useRef(false)
  useLayoutEffect(() => {
    if (storageHydratedRef.current) return
    storageHydratedRef.current = true
    if (initialRef.current?.fromUrl) return
    const stored = loadFiltersFromStorage()
    if (!stored || Object.keys(stored).length === 0) return
    const state = getInitialFilterStateFromStored(stored, isCustomer)
    const vm = getInitialViewModeCustomer(isCustomer, stored)
    setFilterStatus(state.filterStatus)
    setFilterTypeIds(state.filterTypeIds)
    setFilterCompanyIds(state.filterCompanyIds)
    setFilterTagIds(state.filterTagIds)
    setFilterPriorityIds(state.filterPriorityIds ?? [])
    setFilterVisibilityState(state.filterVisibility)
    setFilterTeamIds(state.filterTeamIds)
    setFilterDateRange(state.filterDateRange)
    setFilterSearch(state.filterSearch)
    setFilterSidebarCollapsed(state.filterSidebarCollapsed)
    setViewMode(vm)
    setSortBy(state.sortBy)
    setSortOrder(state.sortOrder)
  }, [isCustomer])

  const fetchLookup = async () => {
    try {
      setLookupReady(false)
      const data = await apiFetch<{
        userTeamIds?: string[]
        userCompanyId?: string | null
        teams: Team[]
        users: UserRecord[]
        ticketTypes: Array<{ id: number; title: string; slug: string; color: string }>
        ticketPriorities: Array<{ id: number; title: string; slug: string; color: string }>
        companies: Array<{ id: string; name: string; color?: string }>
        tags: Array<{ id: string; name: string; slug: string; color?: string }>
        statuses: Array<TicketStatusRecord & { show_in_kanban?: boolean | null; is_active?: boolean }>
      }>('/api/tickets/lookup')

      setTeams(data.teams || [])
      setUsers(data.users || [])
      setTicketTypes(data.ticketTypes || [])
      setTicketPriorities(data.ticketPriorities || [])
      setCompanies(data.companies || [])
      setAllTags(data.tags || [])
      setUserCompanyId(data.userCompanyId ?? null)
      setUserTeamIds(data.userTeamIds || [])

      const stored = loadFiltersFromStorage()
      const fromUrl = initialRef.current?.fromUrl
      const hasStoredTeamPreference = stored && ('filterTeamIds' in stored || 'filterTeamId' in stored)
      if (!fromUrl && !hasStoredTeamPreference && data.userTeamIds?.length === 1) {
        setFilterTeamIds([data.userTeamIds[0]])
      }

      const list = data.statuses || []
      if (list.length > 0) {
        const statusTitle = (s: { slug: string; title: string; customer_title?: string; color: string }) =>
          ticketStatusDisplayLabel(s, { preferCustomerTitle: isCustomer })
        const inKanban = (s: { show_in_kanban?: unknown }) => isTicketStatusInKanban(s.show_in_kanban)
        const isActive = (s: { is_active?: boolean }) => s.is_active !== false
        const activeList = list.filter(isActive)
        const kanbanSlugs = activeList.filter(inKanban).map((s) => s.slug)
        setStatusColumns(
          activeList.filter(inKanban).map((s) => ({ id: s.slug, title: statusTitle(s), color: s.color }))
        )
        setAllStatusColumns(list.map((s) => ({ id: s.slug, title: statusTitle(s), color: s.color })))
        setAllStatuses(
          list.map((s) => ({
            slug: s.slug,
            title: statusTitle(s),
            is_active: s.is_active !== false,
          }))
        )
        const validSlugs = new Set(list.map((s) => s.slug))
        if (fromUrl) {
          const current = initialRef.current?.state.filterStatus ?? []
          const intersection = current.filter((slug: string) => validSlugs.has(slug))
          const allSlugs = list.map((s) => s.slug)
          const resolvedStatus =
            intersection.length > 0 ? intersection : isCustomer ? allSlugs : kanbanSlugs
          setFilterStatus(resolvedStatus)
          lastKanbanSlugsRef.current = kanbanSlugs
          saveFiltersToStorage({ ...(stored || {}), filterStatus: resolvedStatus } as StoredFilter)
        } else {
          if (isCustomer) {
            const allSlugs = list.map((s) => s.slug)
            const hasStoredStatusPreference =
              stored && 'filterStatus' in stored && Array.isArray(stored.filterStatus)
            const fromStore = hasStoredStatusPreference
              ? (stored.filterStatus as string[]).filter((slug: string) => validSlugs.has(slug))
              : null
            setFilterStatus(
              fromStore !== null ? (fromStore.length > 0 ? fromStore : []) : allSlugs
            )
            lastKanbanSlugsRef.current = kanbanSlugs
          } else {
            // Gabungkan slug kanban baru (mis. user centang Show in Kanban untuk Cancel/Archived) ke filter API.
            setFilterStatus((prev) => {
              let next: string[]
              if (prev.length > 0) {
                const pruned = prev.filter((slug) => validSlugs.has(slug))
                next = pruned.length > 0 ? pruned : kanbanSlugs
              } else {
                const hasStoredStatusPreference =
                  stored && 'filterStatus' in stored && Array.isArray(stored.filterStatus)
                if (hasStoredStatusPreference) {
                  const intersection = (stored.filterStatus as string[]).filter((slug: string) =>
                    validSlugs.has(slug)
                  )
                  next = intersection.length > 0 ? intersection : []
                } else {
                  next = kanbanSlugs
                }
              }
              const prevKanban = lastKanbanSlugsRef.current
              lastKanbanSlugsRef.current = kanbanSlugs
              if (prevKanban === null) {
                if (next.length === 0) return []
                const extra = next.filter((s) => !kanbanSlugs.includes(s) && validSlugs.has(s))
                return [...new Set([...kanbanSlugs, ...extra])]
              }
              const newlyAdded = kanbanSlugs.filter((s) => !prevKanban.includes(s))
              if (newlyAdded.length === 0) return next
              return [...new Set([...next, ...newlyAdded])]
            })
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch lookup data:', error)
    } finally {
      setLookupReady(true)
    }
  }

  useEffect(() => {
    lastKanbanSlugsRef.current = null
    fetchLookup()
  }, [isCustomer])

  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
    const delay = filterSearch.trim() ? 350 : 0
    if (delay > 0) {
      fetchDebounceRef.current = setTimeout(() => {
        fetchTickets()
        fetchDebounceRef.current = null
      }, delay)
      return () => {
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
      }
    }
    fetchTickets()
  }, [fetchTickets])

  const searchParamsKey = searchParams.toString()

  useEffect(() => {
    const isTicketsList = pathname === '/tickets' || pathname === '/tickets/'
    if (!isTicketsList) return

    if (prevTicketsListSearchRef.current === null) {
      prevTicketsListSearchRef.current = searchParamsKey
      return
    }
    if (prevTicketsListSearchRef.current === searchParamsKey) return
    prevTicketsListSearchRef.current = searchParamsKey

    applyingFromUrlRef.current = true

    if (hasUrlFilterParams(searchParams)) {
      let parsed = parseFiltersFromUrl(searchParams, { isCustomer })
      if (!parsed) {
        applyingFromUrlRef.current = false
        return
      }
      if (isCustomer && parsed.viewMode === 'roundrobin') {
        parsed = { ...parsed, viewMode: 'kanban' }
      }
      if (
        isCustomer &&
        (parsed.filterTicketType === 'spam' || parsed.filterTicketType === 'trash')
      ) {
        parsed = { ...parsed, filterTicketType: null }
      }
      const isJunkUrl = parsed.filterTicketType === 'spam' || parsed.filterTicketType === 'trash'
      let statuses = parsed.filterStatus
      if (
        !isJunkUrl &&
        lookupReady &&
        allStatuses.length > 0 &&
        statusColumns.length > 0
      ) {
        const valid = new Set(allStatuses.map((s) => s.slug))
        const pruned = statuses.filter((s) => valid.has(s))
        if (pruned.length > 0) {
          statuses = pruned
        } else if (statuses.length === 0) {
          statuses = []
        } else if (isCustomer && allStatuses.length > 0) {
          statuses = allStatuses.map((s) => s.slug)
        } else {
          statuses = statusColumns.map((c) => c.id)
        }
      }
      setFilterStatus(statuses)
      setFilterTypeIds(parsed.filterTypeIds)
      setFilterPriorityIds(parsed.filterPriorityIds ?? [])
      setFilterCompanyIds(parsed.filterCompanyIds)
      setFilterTagIds(parsed.filterTagIds)
      setFilterVisibilityState(parsed.filterVisibility)
      setFilterTeamIds(parsed.filterTeamIds)
      setFilterDateRange(parsed.filterDateRange)
      setFilterSearch(parsed.filterSearch)
      setViewMode(parsed.viewMode)
      setSortBy(parsed.sortBy)
      setSortOrder(parsed.sortOrder)
      setFilterSidebarCollapsed(parsed.filterSidebarCollapsed)
      setFilterTicketType(parsed.filterTicketType ?? null)
    } else {
      const fallbackStatus =
        lookupReady && allStatuses.length > 0 && isCustomer
          ? allStatuses.map((s) => s.slug)
          : lookupReady && statusColumns.length > 0
            ? statusColumns.map((c) => c.id)
            : isCustomer
              ? []
              : DEFAULT_KANBAN_COLUMNS.map((c) => c.id)
      setFilterStatus(fallbackStatus)
      setFilterTypeIds([])
      setFilterPriorityIds([])
      setFilterCompanyIds([])
      setFilterTagIds([])
      setFilterVisibilityState([])
      setFilterTeamIds([])
      setFilterDateRange(null)
      setFilterSearch('')
      setViewMode('kanban')
      setSortBy('updated_at')
      setSortOrder('desc')
      setFilterSidebarCollapsed(true)
      setFilterTicketType(null)
    }
  }, [
    pathname,
    searchParamsKey,
    searchParams,
    isCustomer,
    lookupReady,
    allStatuses,
    statusColumns,
  ])

  /** On every filter change: save to localStorage + update URL (so link can be shared) */
  useEffect(() => {
    saveFiltersToStorage({
      filterStatus,
      filterTypeIds,
      filterPriorityIds,
      filterCompanyIds,
      filterTagIds,
      filterVisibility,
      filterTeamIds,
      filterDateRange:
        filterDateRange?.[0] && filterDateRange?.[1]
          ? [filterDateRange[0].toISOString(), filterDateRange[1].toISOString()]
          : null,
      filterSearch: filterSearch || null,
      viewMode: viewMode,
      filterSidebarCollapsed: filterSidebarCollapsed,
      sortBy: sortBy || null,
      sortOrder: sortOrder || null,
    })

    if (applyingFromUrlRef.current) {
      applyingFromUrlRef.current = false
      return
    }

    /** Always write filter state to URL so link can be shared */
    if (pathname) {
      const qs = buildSearchStringFromFilters({
        filterStatus,
        filterTypeIds,
        filterPriorityIds,
        filterCompanyIds,
        filterTagIds,
        filterVisibility,
        filterTeamIds,
        filterDateRange,
        filterSearch,
        viewMode,
        sortBy,
        sortOrder,
        filterSidebarCollapsed,
        filterTicketType: isCustomer ? null : filterTicketType,
      })
      const url = qs ? `${pathname}?${qs}` : pathname
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + (window.location.search || '') : ''
      if (url !== currentUrl) {
        router.replace(url, { scroll: false })
      }
    }
  }, [
    pathname,
    router,
    filterStatus,
    filterTypeIds,
    filterCompanyIds,
    filterTagIds,
    filterVisibility,
    filterTeamIds,
    filterDateRange,
    filterSearch,
    viewMode,
    filterSidebarCollapsed,
    sortBy,
    sortOrder,
    filterTicketType,
    filterPriorityIds,
    isCustomer,
  ])

  const getFilterQueryString = useCallback(() => {
    return buildSearchStringFromFilters({
      filterStatus,
      filterTypeIds,
      filterPriorityIds,
      filterCompanyIds,
      filterTagIds,
      filterVisibility,
      filterTeamIds,
      filterDateRange,
      filterSearch,
      viewMode,
      sortBy,
      sortOrder,
      filterSidebarCollapsed,
      filterTicketType: isCustomer ? null : filterTicketType,
    })
  }, [
    filterStatus,
    filterTypeIds,
    filterPriorityIds,
    filterCompanyIds,
    filterTagIds,
    filterVisibility,
    filterTeamIds,
    filterDateRange,
    filterSearch,
    viewMode,
    sortBy,
    sortOrder,
    filterSidebarCollapsed,
    filterTicketType,
    isCustomer,
  ])

  useEffect(() => {
    if (!isCustomer) return
    if (filterTicketType === 'spam' || filterTicketType === 'trash') {
      setFilterTicketType(null)
    }
  }, [isCustomer, filterTicketType])

  const filterByStatusFromChip = useCallback((slug: string) => {
    setFilterStatus([slug])
  }, [])

  const filterByPriorityFromChip = useCallback((priorityId: number) => {
    setFilterPriorityIds([priorityId])
  }, [])

  const filterByTagFromChip = useCallback((tagId: string) => {
    setFilterTagIds([tagId])
  }, [])

  const filterByCompanyFromChip = useCallback((companyId: string) => {
    setFilterCompanyIds([companyId])
  }, [])

  useEffect(() => {
    if (
      !isCustomer &&
      (filterTicketType === 'spam' || filterTicketType === 'trash') &&
      viewMode !== 'card'
    ) {
      setViewMode('card')
    }
  }, [filterTicketType, viewMode, isCustomer])

  const handleDragStart: TicketsDragStartHandler = (event) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd: TicketsDragEndHandler = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const ticketId = active.id as number
    let newStatus = over.id as string

    if (!columnsToShow.some((c) => c.id === newStatus)) {
      const ticket = tickets.find((t) => t.id === Number(newStatus))
      if (ticket) {
        newStatus = ticket.status as string
      } else {
        return
      }
    }

    setTickets((prevTickets) =>
      prevTickets.map((t) => (t.id === ticketId ? { ...t, status: newStatus as TicketRecord['status'] } : t))
    )

    try {
      await apiFetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      message.success('Ticket status updated successfully')
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to update ticket status')
      fetchTickets()
    }
  }

  const handleCreate = () => {
    setEditingTicket(null)
    setSelectedAssignees([])
    setSelectedTagIds([])
    setNewTicketAttachments([])
    setDeletedTicketAttachmentIds([])
    form.resetFields()
    const baseValues: Record<string, unknown> = {
      status: resolveDefaultNewTicketStatusSlug(allStatuses),
      visibility: 'public',
    }
    if (isCustomer && userCompanyId) {
      baseValues.company_id = userCompanyId
    }
    form.setFieldsValue(baseValues)
    setModalVisible(true)
  }

  const handleEdit = (record: TicketRecord) => {
    setEditingTicket(record)
    setNewTicketAttachments([])
    setDeletedTicketAttachmentIds([])
    let assigneeIds = record.assignees?.map((a) => a.user_id) || []
    if (record.visibility === 'specific_users' && record.created_by && !assigneeIds.includes(record.created_by)) {
      assigneeIds = [record.created_by, ...assigneeIds]
    }
    setSelectedAssignees(assigneeIds)
    setSelectedTagIds(record.tags?.map((t) => t.id) || [])
    form.setFieldsValue({
      title: record.title,
      description: record.description ?? '',
      short_note: record.short_note || '',
      status: record.status,
      visibility: record.visibility,
      team_id: record.team_id,
      type_id: record.type_id ?? undefined,
      priority_id: record.priority_id ?? undefined,
      company_id: record.company_id ?? undefined,
      due_date: record.due_date ? dayjs(record.due_date) : null,
    })
    setModalVisible(true)
  }

  const handleTicketFilesSelected = async (files: File[] | FileList | null) => {
    const arr = files ? Array.from(files) : []
    if (!arr.length) return
    if (editingTicket && !isCustomer) return
    setAttachmentUploading(true)
    try {
      const companyId = isCustomer
        ? userCompanyId ?? undefined
        : (form.getFieldValue('company_id') as string | undefined)
      const companyName = companyId ? companies.find((c) => c.id === companyId)?.name : undefined
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const result = await uploadTicketFileDraft(file, 'attachments', companyName)
        if (result.url && result.path) {
          setNewTicketAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
        } else if (result.error) {
          message.error(`${file.name}: ${result.error}`)
        }
      }
    } catch {
      message.error('Failed to upload file')
    } finally {
      setAttachmentUploading(false)
    }
  }

  const handleDelete = async (ticketId: number) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId))
    try {
      await apiFetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      message.success('Ticket deleted successfully')
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete ticket')
      fetchTickets()
    }
  }

  const handleBulkMoveToTrash = async (ids: number[]) => {
    if (!ids.length || isCustomer) return
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_type: 'trash' }),
          })
        )
      )
      message.success(`Moved ${ids.length} ticket(s) to trash`)
      await fetchTickets()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to move tickets to trash')
      await fetchTickets()
    }
  }

  const handleBulkMoveToSpam = async (ids: number[]) => {
    if (!ids.length || isCustomer) return
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_type: 'spam' }),
          })
        )
      )
      message.success(`Moved ${ids.length} ticket(s) to spam`)
      await fetchTickets()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to move tickets to spam')
      await fetchTickets()
    }
  }

  const handleBulkDelete = async (ids: number[]) => {
    if (!ids.length || isCustomer) return
    setTickets((prev) => prev.filter((t) => !ids.includes(t.id)))
    try {
      await Promise.all(ids.map((id) => apiFetch(`/api/tickets/${id}`, { method: 'DELETE' })))
      message.success(`Deleted ${ids.length} ticket(s)`)
      await fetchTickets()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete tickets')
      await fetchTickets()
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const effectiveValues = { ...values }
      if (isCustomer && !editingTicket) {
        effectiveValues.status = resolveDefaultNewTicketStatusSlug(allStatuses)
        effectiveValues.visibility = 'public'
        effectiveValues.company_id = userCompanyId ?? null
      }

      const customerEditing = Boolean(isCustomer && editingTicket)
      if (!customerEditing) {
        if (effectiveValues.visibility === 'specific_users' && selectedAssignees.length === 0) {
          message.error('Please select at least one user for specific users visibility')
          return
        }

        if (effectiveValues.visibility === 'team' && !effectiveValues.team_id) {
          message.error('Please select a team for team visibility')
          return
        }
      }

      const ticketPayload: Record<string, unknown> = {
        title: effectiveValues.title,
        short_note: effectiveValues.short_note || null,
        status: effectiveValues.status,
        visibility: effectiveValues.visibility,
        team_id: effectiveValues.team_id || null,
        type_id: effectiveValues.type_id ?? null,
        priority_id: effectiveValues.priority_id ?? null,
        company_id: effectiveValues.company_id ?? null,
        due_date: effectiveValues.due_date ? (effectiveValues.due_date as dayjs.Dayjs).toISOString() : null,
      }

      if (editingTicket) {
        if (customerEditing) {
          const attachBody: Record<string, unknown> = {
            title: values.title,
            description: values.description ?? null,
            type_id: values.type_id ?? null,
            priority_id: values.priority_id ?? null,
          }
          if (newTicketAttachments.length > 0) {
            attachBody.attachments_add = newTicketAttachments.map((a) => ({
              file_url: a.url,
              file_name: a.file_name,
              file_path: a.file_path,
            }))
          }
          if (deletedTicketAttachmentIds.length > 0) {
            attachBody.attachments_delete = deletedTicketAttachmentIds
          }

          await apiFetch(`/api/tickets/${editingTicket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(attachBody),
          })

          message.success('Ticket updated successfully')
          await fetchTickets()
        } else {
          await apiFetch(`/api/tickets/${editingTicket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...ticketPayload,
              assignees: values.visibility === 'specific_users' ? selectedAssignees : [],
              tag_ids: selectedTagIds,
            }),
          })

          message.success('Ticket updated successfully')

          const typeId = values.type_id as number | undefined
          const priorityId = values.priority_id as number | undefined
          const companyId = values.company_id as string | undefined
          const teamId = values.team_id as string | undefined
          const updatedRecord: TicketRecord = {
            ...editingTicket,
            title: values.title as string,
            short_note: (values.short_note as string) || null,
            status: values.status as TicketRecord['status'],
            visibility: values.visibility as TicketRecord['visibility'],
            team_id: teamId ?? null,
            type_id: typeId ?? null,
            priority_id: priorityId ?? null,
            company_id: companyId ?? null,
            due_date: values.due_date ? (values.due_date as dayjs.Dayjs).toISOString() : null,
            updated_at: new Date().toISOString(),
            team_name: teamId ? teams.find((t) => t.id === teamId)?.name ?? undefined : undefined,
            type: typeId != null ? ticketTypes.find((t) => t.id === typeId) ?? null : null,
            priority: priorityId != null ? ticketPriorities.find((p) => p.id === priorityId) ?? null : null,
            company: companyId ? companies.find((c) => c.id === companyId) ?? null : null,
            tags: allTags.filter((t) => selectedTagIds.includes(t.id)),
            assignees:
              values.visibility === 'specific_users'
                ? selectedAssignees.map((userId) => ({
                    id: `temp-${userId}`,
                    user_id: userId,
                    user_name: users.find((u) => u.id === userId)?.full_name || users.find((u) => u.id === userId)?.email || 'Unknown',
                  }))
                : [],
          }
          setTickets((prev) => prev.map((t) => (t.id === editingTicket.id ? updatedRecord : t)))
        }
      } else {
        const createPayload = {
          ...ticketPayload,
          description: values.description || null,
          assignees: values.visibility === 'specific_users' ? selectedAssignees : [],
          tag_ids: selectedTagIds,
          attachments: newTicketAttachments.map((a) => ({
            file_url: a.url,
            file_name: a.file_name,
            file_path: a.file_path,
          })),
        }
        const newTicket = await apiFetch<{ id: number; created_at: string; updated_at: string }>('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        })

        message.success('Ticket created successfully')

        const typeId = effectiveValues.type_id as number | undefined
        const priorityId = effectiveValues.priority_id as number | undefined
        const companyId = effectiveValues.company_id as string | undefined
        const teamId = effectiveValues.team_id as string | undefined
        const newRecord: TicketRecord = {
          id: newTicket.id,
          title: effectiveValues.title as string,
          description: (effectiveValues.description as string) || null,
          short_note: (effectiveValues.short_note as string) || null,
          created_by: currentUserId,
          due_date: effectiveValues.due_date ? (effectiveValues.due_date as dayjs.Dayjs).toISOString() : null,
          status: effectiveValues.status as TicketRecord['status'],
          visibility: effectiveValues.visibility as TicketRecord['visibility'],
          team_id: teamId ?? null,
          type_id: typeId ?? null,
          priority_id: priorityId ?? null,
          company_id: companyId ?? null,
          created_at: newTicket.created_at,
          updated_at: newTicket.updated_at,
          creator_name: users.find((u) => u.id === currentUserId)?.full_name || users.find((u) => u.id === currentUserId)?.email || 'Unknown',
          team_name: teamId ? teams.find((t) => t.id === teamId)?.name ?? undefined : undefined,
          type: typeId != null ? ticketTypes.find((t) => t.id === typeId) ?? null : null,
          priority: priorityId != null ? ticketPriorities.find((p) => p.id === priorityId) ?? null : null,
          company: companyId ? companies.find((c) => c.id === companyId) ?? null : null,
          tags: allTags.filter((t) => selectedTagIds.includes(t.id)),
          assignees:
            effectiveValues.visibility === 'specific_users'
              ? selectedAssignees.map((userId) => ({
                  id: `temp-${userId}`,
                  user_id: userId,
                  user_name: users.find((u) => u.id === userId)?.full_name || users.find((u) => u.id === userId)?.email || 'Unknown',
                }))
              : [],
          checklist_completed: 0,
          checklist_total: 0,
          has_unread_replies: false,
        }
        setTickets((prev) => [newRecord, ...prev])
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedAssignees([])
      setSelectedTagIds([])
      setNewTicketAttachments([])
      setDeletedTicketAttachmentIds([])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const handleModalCancel = async () => {
    if (newTicketAttachments.length > 0) {
      for (const a of newTicketAttachments) {
        if (a.file_path) await deleteFile(a.file_path)
      }
      setNewTicketAttachments([])
    }
    setDeletedTicketAttachmentIds([])
    setModalVisible(false)
    form.resetFields()
    setSelectedAssignees([])
    setSelectedTagIds([])
  }

  const handleRemoveNewAttachment = async (attachment: NewTicketAttachment) => {
    if (attachment.file_path) await deleteFile(attachment.file_path)
    setNewTicketAttachments((prev) => prev.filter((a) => a.url !== attachment.url))
  }

  return {
    collapsed,
    setCollapsed,
    tickets,
    loading,
    modalVisible,
    editingTicket,
    form,
    teams,
    users,
    selectedAssignees,
    setSelectedAssignees,
    selectedTagIds,
    setSelectedTagIds,
    ticketTypes,
    ticketPriorities,
    companies,
    allTags,
    allStatuses,
    allStatusColumns,
    statusColumns,
    activeId,
    columnsToShow,
    filteredTickets,
    filterStatus,
    setFilterStatus,
    filterTypeIds,
    setFilterTypeIds,
    filterCompanyIds,
    setFilterCompanyIds,
    filterTagIds,
    setFilterTagIds,
    filterPriorityIds,
    setFilterPriorityIds,
    filterVisibility,
    setFilterVisibility,
    filterTeamIds,
    setFilterTeamIds,
    filterDateRange,
    setFilterDateRange,
    filterSearch,
    setFilterSearch,
    filterSidebarCollapsed,
    setFilterSidebarCollapsed,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    hasActiveFilters,
    clearFilters,
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkMoveToTrash,
    handleBulkMoveToSpam,
    handleBulkDelete,
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    newTicketAttachments,
    setNewTicketAttachments,
    deletedTicketAttachmentIds,
    setDeletedTicketAttachmentIds,
    handleTicketFilesSelected,
    handleRemoveNewAttachment,
    attachmentUploading,
    userTeamIds,
    lookupReady,
    getFilterQueryString,
    filterTicketType,
    filterByStatusFromChip,
    filterByPriorityFromChip,
    filterByTagFromChip,
    filterByCompanyFromChip,
    submitting,
  }
}
