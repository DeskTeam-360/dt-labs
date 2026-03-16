'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

export type TicketsDragStartHandler = (event: DragStartEvent) => void
export type TicketsDragEndHandler = (event: DragEndEvent) => Promise<void>
import { Form, message } from 'antd'
import dayjs from 'dayjs'

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
import { uploadTicketFileDraft, deleteFile } from '@/utils/storage'
import type { TicketRecord, Team, UserRecord } from './types'
import type { NewTicketAttachment } from './types'
import {
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_ALL_STATUSES,
  DEFAULT_ALL_STATUS_COLUMNS,
  type StatusColumn,
  type TicketSortField,
  type TicketSortOrder,
} from './types'
import type { TicketStatusRecord } from './types'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

const getInitialFilterState = () => {
  const stored = loadFiltersFromStorage()
  return {
    filterStatus: (stored?.filterStatus && stored.filterStatus.length) ? stored.filterStatus : DEFAULT_KANBAN_COLUMNS.map((c) => c.id),
    filterTypeIds:
      (stored?.filterTypeIds && stored.filterTypeIds.length) || (stored?.filterTypeId != null)
        ? (stored?.filterTypeIds && stored.filterTypeIds.length
            ? stored.filterTypeIds
            : stored?.filterTypeId != null
              ? [stored.filterTypeId]
              : [])
        : [],
    filterCompanyIds:
      (stored?.filterCompanyIds && stored.filterCompanyIds.length) || (stored?.filterCompanyId != null)
        ? (stored?.filterCompanyIds && stored.filterCompanyIds.length
            ? stored.filterCompanyIds
            : stored?.filterCompanyId
              ? [stored.filterCompanyId]
              : [])
        : [],
    filterTagIds: (stored?.filterTagIds && stored.filterTagIds.length) ? stored.filterTagIds : [],
    filterVisibility: (stored?.filterVisibility && stored.filterVisibility.length) ? stored.filterVisibility : ['public'],
    filterTeamIds:
      (stored?.filterTeamIds && stored.filterTeamIds.length) || (stored?.filterTeamId != null)
        ? (stored?.filterTeamIds && stored.filterTeamIds.length
            ? stored.filterTeamIds
            : stored?.filterTeamId
              ? [stored.filterTeamId]
              : [])
        : [],
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
  }
}

function getInitialViewModeCustomer(isCustomer: boolean, stored: StoredFilter | null): 'kanban' | 'list' | 'card' | 'roundrobin' {
  const storedMode = stored?.viewMode as 'kanban' | 'list' | 'card' | 'roundrobin'
  if (isCustomer && storedMode === 'roundrobin') return 'kanban'
  return storedMode || 'kanban'
}

const initialState = getInitialFilterState()

export function useTicketsData(currentUserId: string, isCustomer = false) {
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
  const [statusColumns, setStatusColumns] = useState<StatusColumn[]>(DEFAULT_KANBAN_COLUMNS)
  const [allStatusColumns, setAllStatusColumns] = useState<StatusColumn[]>(DEFAULT_ALL_STATUS_COLUMNS)
  const [allStatuses, setAllStatuses] = useState<{ slug: string; title: string }[]>(DEFAULT_ALL_STATUSES)
  const [filterStatus, setFilterStatus] = useState<string[]>(initialState.filterStatus)
  const [filterTypeIds, setFilterTypeIds] = useState<number[]>(initialState.filterTypeIds)
  const [filterCompanyIds, setFilterCompanyIds] = useState<string[]>(initialState.filterCompanyIds)
  const [filterTagIds, setFilterTagIds] = useState<string[]>(initialState.filterTagIds)
  const [filterVisibility, setFilterVisibility] = useState<string[]>(initialState.filterVisibility)
  const [filterTeamIds, setFilterTeamIds] = useState<string[]>(initialState.filterTeamIds)
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(initialState.filterDateRange)
  const [filterSearch, setFilterSearch] = useState(initialState.filterSearch)
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(initialState.filterSidebarCollapsed)
  const [sortBy, setSortBy] = useState<TicketSortField>(initialState.sortBy)
  const [sortOrder, setSortOrder] = useState<TicketSortOrder>(initialState.sortOrder)
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'card' | 'roundrobin'>(() => {
    const stored = initialState.viewMode
    if (isCustomer && stored === 'roundrobin') return 'kanban'
    return stored
  })
  const [newTicketAttachments, setNewTicketAttachments] = useState<NewTicketAttachment[]>([])
  const [attachmentUploading, setAttachmentUploading] = useState(false)

  /** Server returns filtered data - no client-side filtering */
  const filteredTickets = tickets

  const columnsToShow = useMemo(
    () => (filterStatus.length > 0 ? allStatusColumns.filter((c) => filterStatus.includes(c.id)) : statusColumns),
    [filterStatus, allStatusColumns, statusColumns]
  )

  const hasActiveFilters =
    filterStatus.length > 0 ||
    filterTypeIds.length > 0 ||
    filterCompanyIds.length > 0 ||
    filterTagIds.length > 0 ||
    filterVisibility.length > 0 ||
    filterTeamIds.length > 0 ||
    (filterDateRange != null && filterDateRange[0] != null && filterDateRange[1] != null) ||
    filterSearch.trim() !== ''

  const clearFilters = () => {
    setFilterStatus(statusColumns.map((c) => c.id))
    setFilterTypeIds([])
    setFilterCompanyIds([])
    setFilterTagIds([])
    setFilterVisibility(['team'])
    setFilterTeamIds([])
    setFilterDateRange(null)
    setFilterSearch('')
  }

  const fetchTickets = useCallback(async () => {
    const params = new URLSearchParams()
    if (!isCustomer) {
      if (filterCompanyIds.length > 0) params.set('company_ids', filterCompanyIds.join(','))
      if (filterTagIds.length > 0) params.set('tag_ids', filterTagIds.join(','))
      if (filterVisibility.length > 0) params.set('visibility', filterVisibility.join(','))
      if (filterTeamIds.length > 0) params.set('team_ids', filterTeamIds.join(','))
    }
    if (filterStatus.length > 0) params.set('status', filterStatus.join(','))
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
  ])

  const [userCompanyId, setUserCompanyId] = useState<string | null>(null)

  const fetchLookup = async () => {
    try {
      const data = await apiFetch<{
        userTeamIds?: string[]
        userCompanyId?: string | null
        teams: Team[]
        users: UserRecord[]
        ticketTypes: Array<{ id: number; title: string; slug: string; color: string }>
        ticketPriorities: Array<{ id: number; title: string; slug: string; color: string }>
        companies: Array<{ id: string; name: string; color?: string }>
        tags: Array<{ id: string; name: string; slug: string; color?: string }>
        statuses: TicketStatusRecord[]
      }>('/api/tickets/lookup')

      setTeams(data.teams || [])
      setUsers(data.users || [])
      setTicketTypes(data.ticketTypes || [])
      setTicketPriorities(data.ticketPriorities || [])
      setCompanies(data.companies || [])
      setAllTags(data.tags || [])
      setUserCompanyId(data.userCompanyId ?? null)

      const stored = loadFiltersFromStorage()
      const hasStoredTeamPreference = stored && ('filterTeamIds' in stored || 'filterTeamId' in stored)
      if (!hasStoredTeamPreference && data.userTeamIds?.length === 1) {
        setFilterTeamIds([data.userTeamIds[0]])
      }

      const list = data.statuses || []
      if (list.length > 0) {
        const statusTitle = (s: { slug: string; title: string; customer_title?: string; color: string }) =>
          isCustomer && s.customer_title ? s.customer_title : s.title
        const kanbanSlugs = list.filter((s) => s.show_in_kanban).map((s) => s.slug)
        setStatusColumns(list.filter((s) => s.show_in_kanban).map((s) => ({ id: s.slug, title: statusTitle(s), color: s.color })))
        setAllStatusColumns(list.map((s) => ({ id: s.slug, title: statusTitle(s), color: s.color })))
        setAllStatuses(list.map((s) => ({ slug: s.slug, title: statusTitle(s) })))
        const hasStoredStatusPreference = stored && ('filterStatus' in stored && Array.isArray(stored.filterStatus) && stored.filterStatus.length > 0)
        let resolvedStatus: string[]
        if (hasStoredStatusPreference && stored?.filterStatus?.length) {
          const validSlugs = new Set(list.map((s) => s.slug))
          const intersection = stored.filterStatus.filter((slug: string) => validSlugs.has(slug))
          resolvedStatus = intersection.length > 0 ? intersection : kanbanSlugs
        } else {
          resolvedStatus = kanbanSlugs
        }
        setFilterStatus(resolvedStatus)
        saveFiltersToStorage({ ...(stored || {}), filterStatus: resolvedStatus.length ? resolvedStatus : null } as StoredFilter)
      }
    } catch (error) {
      console.error('Failed to fetch lookup data:', error)
    }
  }

  useEffect(() => {
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

  useEffect(() => {
    saveFiltersToStorage({
      filterStatus: filterStatus.length ? filterStatus : null,
      filterTypeIds: filterTypeIds.length ? filterTypeIds : null,
      filterCompanyIds: filterCompanyIds.length ? filterCompanyIds : null,
      filterTagIds: filterTagIds.length ? filterTagIds : null,
      filterVisibility: filterVisibility.length ? filterVisibility : null,
      filterTeamIds: filterTeamIds.length ? filterTeamIds : null,
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
  }, [
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
  ])

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
    form.resetFields()
    const baseValues: Record<string, unknown> = {
      status: allStatuses[0]?.slug ?? 'to_do',
      visibility: 'private',
    }
    if (isCustomer && userCompanyId) {
      baseValues.company_id = userCompanyId
    }
    form.setFieldsValue(baseValues)
    setModalVisible(true)
  }

  const handleEdit = (record: TicketRecord) => {
    setEditingTicket(record)
    setSelectedAssignees(record.assignees?.map((a) => a.user_id) || [])
    setSelectedTagIds(record.tags?.map((t) => t.id) || [])
    form.setFieldsValue({
      title: record.title,
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
    if (!arr.length || editingTicket) return
    setAttachmentUploading(true)
    try {
      const companyId = form.getFieldValue('company_id') as string | undefined
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

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const effectiveValues = { ...values }
      if (isCustomer && !editingTicket) {
        effectiveValues.status = allStatuses[0]?.slug ?? 'to_do'
        effectiveValues.visibility = 'private'
        effectiveValues.company_id = userCompanyId ?? null
      }

      if (effectiveValues.visibility === 'specific_users' && selectedAssignees.length === 0) {
        message.error('Please select at least one user for specific users visibility')
        return
      }

      if (effectiveValues.visibility === 'team' && !effectiveValues.team_id) {
        message.error('Please select a team for team visibility')
        return
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
        await apiFetch(`/api/tickets/${editingTicket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...ticketPayload,
            assignees: values.visibility === 'specific_users' ? selectedAssignees : [],
            tag_ids: selectedTagIds,
            // Edit: no description, no attachments
          }),
        })

        message.success('Ticket updated successfully')

        // Optimistic update
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
      // setDeletedTicketAttachmentIds([])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save ticket')
    }
  }

  const handleModalCancel = async () => {
    if (!editingTicket && newTicketAttachments.length > 0) {
      for (const a of newTicketAttachments) {
        if (a.file_path) await deleteFile(a.file_path)
      }
      setNewTicketAttachments([])
    }
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
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    newTicketAttachments,
    setNewTicketAttachments,
    handleTicketFilesSelected,
    handleRemoveNewAttachment,
    attachmentUploading,
  }
}
