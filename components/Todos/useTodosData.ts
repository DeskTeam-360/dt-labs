'use client'

import { useState, useEffect, useMemo } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

export type TodosDragStartHandler = (event: DragStartEvent) => void
export type TodosDragEndHandler = (event: DragEndEvent) => Promise<void>
import { Form, message } from 'antd'
import dayjs from 'dayjs'
import { createClient } from '@/utils/supabase/client'
import { uploadTicketFile, uploadTicketFileDraft } from '@/utils/storage'
import type { TodoRecord, Team, UserRecord, TicketAttachment, NewTicketAttachment } from './types'
import {
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_ALL_STATUSES,
  DEFAULT_ALL_STATUS_COLUMNS,
  type StatusColumn,
} from './types'
import type { TodoStatusRecord } from './types'

export function useTodosData(currentUserId: string) {
  const [collapsed, setCollapsed] = useState(true)
  const [todos, setTodos] = useState<TodoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTodo, setEditingTodo] = useState<TodoRecord | null>(null)
  const [form] = Form.useForm()
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [ticketTypes, setTicketTypes] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; color?: string }>>([])
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; slug: string; color?: string }>>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [statusColumns, setStatusColumns] = useState<StatusColumn[]>(DEFAULT_KANBAN_COLUMNS)
  const [allStatusColumns, setAllStatusColumns] = useState<StatusColumn[]>(DEFAULT_ALL_STATUS_COLUMNS)
  const [allStatuses, setAllStatuses] = useState<{ slug: string; title: string }[]>(DEFAULT_ALL_STATUSES)
  const [filterStatus, setFilterStatus] = useState<string[]>(DEFAULT_KANBAN_COLUMNS.map((c) => c.id))
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterCompanyId, setFilterCompanyId] = useState<string | undefined>(undefined)
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'card'>('kanban')
  const [ticketAttachmentsFromDb, setTicketAttachmentsFromDb] = useState<TicketAttachment[]>([])
  const [newTicketAttachments, setNewTicketAttachments] = useState<NewTicketAttachment[]>([])
  const [deletedTicketAttachmentIds, setDeletedTicketAttachmentIds] = useState<string[]>([])

  const supabase = createClient()

  const filteredTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (filterStatus.length > 0) {
        if (!filterStatus.includes(todo.status)) return false
      }
      if (filterTypeId != null) {
        if (todo.type_id !== filterTypeId) return false
      }
      if (filterCompanyId != null && filterCompanyId !== '') {
        if (todo.company_id !== filterCompanyId) return false
      }
      if (filterTagIds.length > 0) {
        const todoTagIds = (todo.tags || []).map((t) => t.id)
        const hasMatch = filterTagIds.some((tagId) => todoTagIds.includes(tagId))
        if (!hasMatch) return false
      }
      if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
        const created = dayjs(todo.created_at)
        if (created.isBefore(filterDateRange[0].startOf('day')) || created.isAfter(filterDateRange[1].endOf('day'))) return false
      }
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase()
        const matchTitle = todo.title?.toLowerCase().includes(q)
        const matchDesc = todo.description?.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc) return false
      }
      return true
    })
  }, [todos, filterStatus, filterTypeId, filterCompanyId, filterTagIds, filterDateRange, filterSearch])

  const columnsToShow = useMemo(
    () => (filterStatus.length > 0 ? allStatusColumns.filter((c) => filterStatus.includes(c.id)) : statusColumns),
    [filterStatus, allStatusColumns, statusColumns]
  )

  const hasActiveFilters =
    filterStatus.length > 0 ||
    filterTypeId != null ||
    filterCompanyId != null ||
    filterTagIds.length > 0 ||
    (filterDateRange != null && filterDateRange[0] != null && filterDateRange[1] != null) ||
    filterSearch.trim() !== ''

  const clearFilters = () => {
    setFilterStatus(statusColumns.map((c) => c.id))
    setFilterTypeId(undefined)
    setFilterCompanyId(undefined)
    setFilterTagIds([])
    setFilterDateRange(null)
    setFilterSearch('')
  }

  const fetchTodos = async () => {
    setLoading(true)
    try {
      const { data: todosData, error: todosError } = await supabase
        .from('tickets')
        .select(`
          *,
          creator:users!todos_created_by_fkey(id, full_name, email),
          team:teams(id, name),
          type:ticket_types(id, title, slug, color),
          company:companies(id, name)
        `)
        .order('created_at', { ascending: false })

      if (todosError) throw todosError

      const ticketIds = (todosData || []).map((t: { id: number }) => t.id)
      const { data: ticketTagsData } = ticketIds.length > 0
        ? await supabase
            .from('ticket_tags')
            .select('ticket_id, tag_id, tags(id, name, slug, color)')
            .in('ticket_id', ticketIds)
        : { data: [] }
      const tagsByTicketId: Record<number, Array<{ id: string; name: string; slug: string; color?: string }>> = {}
      ;(ticketTagsData || []).forEach((row: Record<string, unknown>) => {
        const tags = row.tags as { id: string; name: string; slug: string; color?: string } | undefined
        if (!tags) return
        const ticketId = row.ticket_id as number
        if (!tagsByTicketId[ticketId]) tagsByTicketId[ticketId] = []
        const tag = Array.isArray(tags) ? tags[0] : tags
        tagsByTicketId[ticketId].push(tag)
      })

      const todosWithAssignees = await Promise.all(
        (todosData || []).map(async (todo: {
          id: number
          creator?: { full_name?: string; email?: string }
          team?: { name?: string }
          [key: string]: unknown
        }) => {
          const { data: assigneesData } = await supabase
            .from('todo_assignees')
            .select(`
              *,
              user:users!todo_assignees_user_id_fkey(id, full_name, email)
            `)
            .eq('todo_id', todo.id)

          const { data: checklistData } = await supabase
            .from('todo_checklist')
            .select('*')
            .eq('todo_id', todo.id)

          const completedCount = (checklistData || []).filter((item: { is_completed: boolean }) => item.is_completed).length
          const totalCount = checklistData?.length || 0

          return {
            ...todo,
            creator_name: todo.creator?.full_name || todo.creator?.email || 'Unknown',
            team_name: todo.team?.name || null,
            tags: tagsByTicketId[todo.id] || [],
            assignees: (assigneesData || []).map((assignee: { id: string; user_id: string; user?: { full_name?: string; email?: string } }) => ({
              id: assignee.id,
              user_id: assignee.user_id,
              user_name: assignee.user?.full_name || assignee.user?.email || 'Unknown',
            })),
            checklist_items: checklistData || [],
            checklist_completed: completedCount,
            checklist_total: totalCount,
          }
        })
      )

      setTodos(todosWithAssignees as TodoRecord[])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch tickets')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name')
        .order('name', { ascending: true })
      if (error) throw error
      setTeams(data || [])
    } catch (error) {
      console.error('Failed to fetch teams:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .order('full_name', { ascending: true })
      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const fetchTicketTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_types')
        .select('id, title, slug, color')
        .order('sort_order', { ascending: true })
      if (error) throw error
      setTicketTypes((data || []) as Array<{ id: number; title: string; slug: string; color: string }>)
    } catch (e) {
      console.error('Failed to fetch ticket types', e)
    }
  }

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, color')
        .order('name', { ascending: true })
      if (error) throw error
      setCompanies(data || [])
    } catch (e) {
      console.error('Failed to fetch companies', e)
    }
  }

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, slug, color')
        .order('name', { ascending: true })
      if (error) throw error
      setAllTags((data || []) as Array<{ id: string; name: string; slug: string; color?: string }>)
    } catch (e) {
      console.error('Failed to fetch tags', e)
    }
  }

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('todo_statuses')
        .select('id, slug, title, color, show_in_kanban, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      const list = (data || []) as TodoStatusRecord[]
      if (list.length > 0) {
        const kanbanSlugs = list.filter((s) => s.show_in_kanban).map((s) => s.slug)
        setStatusColumns(list.filter((s) => s.show_in_kanban).map((s) => ({ id: s.slug, title: s.title, color: s.color })))
        setAllStatusColumns(list.map((s) => ({ id: s.slug, title: s.title, color: s.color })))
        setAllStatuses(list.map((s) => ({ slug: s.slug, title: s.title })))
        setFilterStatus(kanbanSlugs)
      }
    } catch (error) {
      console.error('Failed to fetch todo statuses, using defaults:', error)
    }
  }

  useEffect(() => {
    fetchTodos()
    fetchTeams()
    fetchUsers()
    fetchStatuses()
    fetchTicketTypes()
    fetchCompanies()
    fetchTags()
  }, [])

  useEffect(() => {
    if (!modalVisible || !editingTodo?.id) return
    const fetchAttachments = async () => {
      const { data } = await supabase
        .from('ticket_attachments')
        .select('id, file_url, file_name, file_path')
        .eq('ticket_id', editingTodo.id)
        .order('created_at', { ascending: true })
      setTicketAttachmentsFromDb(data || [])
    }
    fetchAttachments()
  }, [modalVisible, editingTodo?.id])

  const handleDragStart: TodosDragStartHandler = (event) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd: TodosDragEndHandler = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const todoId = active.id as number
    let newStatus = over.id as string

    if (!columnsToShow.some((c) => c.id === newStatus)) {
      const todo = todos.find((t) => t.id === Number(newStatus))
      if (todo) {
        newStatus = todo.status as string
      } else {
        return
      }
    }

    setTodos((prevTodos) =>
      prevTodos.map((t) => (t.id === todoId ? { ...t, status: newStatus as TodoRecord['status'] } : t))
    )

    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', todoId)

      if (error) throw error
      message.success('Ticket status updated successfully')
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to update ticket status')
      fetchTodos()
    }
  }

  const handleCreate = () => {
    setEditingTodo(null)
    setSelectedAssignees([])
    setSelectedTagIds([])
    setNewTicketAttachments([])
    setDeletedTicketAttachmentIds([])
    setTicketAttachmentsFromDb([])
    form.resetFields()
    form.setFieldsValue({
      status: allStatuses[0]?.slug ?? 'to_do',
      visibility: 'private',
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TodoRecord) => {
    setEditingTodo(record)
    setSelectedAssignees(record.assignees?.map((a) => a.user_id) || [])
    setSelectedTagIds(record.tags?.map((t) => t.id) || [])
    setNewTicketAttachments([])
    setDeletedTicketAttachmentIds([])
    form.setFieldsValue({
      title: record.title,
      description: record.description || '',
      status: record.status,
      visibility: record.visibility,
      team_id: record.team_id,
      type_id: record.type_id ?? undefined,
      company_id: record.company_id ?? undefined,
      due_date: record.due_date ? dayjs(record.due_date) : null,
    })
    setModalVisible(true)
  }

  const handleTicketFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const result = editingTodo
          ? await uploadTicketFile(file, editingTodo.id, 'attachments')
          : await uploadTicketFileDraft(file, 'attachments')
        if (result.url && result.path) {
          setNewTicketAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
        } else if (result.error) {
          message.error(`${file.name}: ${result.error}`)
        }
      }
    } catch {
      message.error('Failed to upload file')
    }
  }

  const handleDelete = async (todoId: number) => {
    try {
      const { error: assigneesError } = await supabase
        .from('todo_assignees')
        .delete()
        .eq('todo_id', todoId)
      if (assigneesError) throw assigneesError

      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', todoId)
      if (error) throw error

      message.success('Ticket deleted successfully')
      fetchTodos()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete ticket')
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      if (values.visibility === 'specific_users' && selectedAssignees.length === 0) {
        message.error('Please select at least one user for specific users visibility')
        return
      }

      if (values.visibility === 'team' && !values.team_id) {
        message.error('Please select a team for team visibility')
        return
      }

      const todoData = {
        title: values.title,
        description: values.description || null,
        status: values.status,
        visibility: values.visibility,
        team_id: values.team_id || null,
        type_id: values.type_id ?? null,
        company_id: values.company_id ?? null,
        due_date: values.due_date ? (values.due_date as dayjs.Dayjs).toISOString() : null,
      }

      if (editingTodo) {
        const { error } = await supabase
          .from('tickets')
          .update(todoData)
          .eq('id', editingTodo.id)
        if (error) throw error

        if (values.visibility === 'specific_users') {
          await supabase.from('todo_assignees').delete().eq('todo_id', editingTodo.id)
          if (selectedAssignees.length > 0) {
            const assigneesToInsert = selectedAssignees.map((userId) => ({
              todo_id: editingTodo.id,
              user_id: userId,
            }))
            const { error: assigneesError } = await supabase.from('todo_assignees').insert(assigneesToInsert)
            if (assigneesError) throw assigneesError
          }
        } else {
          await supabase.from('todo_assignees').delete().eq('todo_id', editingTodo.id)
        }

        await supabase.from('ticket_tags').delete().eq('ticket_id', editingTodo.id)
        if (selectedTagIds.length > 0) {
          await supabase.from('ticket_tags').insert(
            selectedTagIds.map((tagId) => ({ ticket_id: editingTodo.id, tag_id: tagId }))
          )
        }

        if (deletedTicketAttachmentIds.length > 0) {
          await supabase.from('ticket_attachments').delete().in('id', deletedTicketAttachmentIds)
        }
        if (newTicketAttachments.length > 0) {
          await supabase.from('ticket_attachments').insert(
            newTicketAttachments.map((a) => ({
              ticket_id: editingTodo.id,
              file_url: a.url,
              file_name: a.file_name,
              file_path: a.file_path,
              uploaded_by: currentUserId,
            }))
          )
        }

        message.success('Ticket updated successfully')
      } else {
        const { data: newTodo, error } = await supabase
          .from('tickets')
          .insert({
            ...todoData,
            created_by: currentUserId,
          })
          .select()
          .single()
        if (error) throw error

        if (values.visibility === 'specific_users' && selectedAssignees.length > 0) {
          const assigneesToInsert = selectedAssignees.map((userId) => ({
            todo_id: newTodo.id,
            user_id: userId,
          }))
          const { error: assigneesError } = await supabase.from('todo_assignees').insert(assigneesToInsert)
          if (assigneesError) throw assigneesError
        }

        if (selectedTagIds.length > 0) {
          await supabase.from('ticket_tags').insert(
            selectedTagIds.map((tagId) => ({ ticket_id: newTodo.id, tag_id: tagId }))
          )
        }

        if (newTicketAttachments.length > 0) {
          await supabase.from('ticket_attachments').insert(
            newTicketAttachments.map((a) => ({
              ticket_id: newTodo.id,
              file_url: a.url,
              file_name: a.file_name,
              file_path: a.file_path,
              uploaded_by: currentUserId,
            }))
          )
        }

        message.success('Ticket created successfully')
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedAssignees([])
      setSelectedTagIds([])
      setNewTicketAttachments([])
      setDeletedTicketAttachmentIds([])
      fetchTodos()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save todo')
    }
  }

  const handleModalCancel = () => {
    setModalVisible(false)
    form.resetFields()
    setSelectedAssignees([])
    setSelectedTagIds([])
  }

  return {
    collapsed,
    setCollapsed,
    todos,
    loading,
    modalVisible,
    editingTodo,
    form,
    teams,
    users,
    selectedAssignees,
    setSelectedAssignees,
    selectedTagIds,
    setSelectedTagIds,
    ticketTypes,
    companies,
    allTags,
    allStatuses,
    allStatusColumns,
    statusColumns,
    activeId,
    columnsToShow,
    filteredTodos,
    filterStatus,
    setFilterStatus,
    filterTypeId,
    setFilterTypeId,
    filterCompanyId,
    setFilterCompanyId,
    filterTagIds,
    setFilterTagIds,
    filterDateRange,
    setFilterDateRange,
    filterSearch,
    setFilterSearch,
    filterSidebarCollapsed,
    setFilterSidebarCollapsed,
    viewMode,
    setViewMode,
    ticketAttachmentsFromDb,
    newTicketAttachments,
    setNewTicketAttachments,
    deletedTicketAttachmentIds,
    setDeletedTicketAttachmentIds,
    hasActiveFilters,
    clearFilters,
    handleCreate,
    handleEdit,
    handleDelete,
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    handleTicketFilesSelected,
  }
}
