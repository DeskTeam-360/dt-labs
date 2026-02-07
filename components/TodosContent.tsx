'use client'

import {
  Layout,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Tooltip,
  Avatar,
  Empty,
  Badge,
  Spin,
  Dropdown,
  Flex,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  UserOutlined,
  DragOutlined,
  EyeOutlined,
  MoreOutlined,
  FilterOutlined,
  PaperClipOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { uploadTicketFile, uploadTicketFileDraft } from '@/utils/storage'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import CommentWysiwyg from './TodoDetail/CommentWysiwyg'
import dayjs from 'dayjs'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

interface TodosContentProps {
  user: User
}

interface TodoRecord {
  id: number
  title: string
  description: string | null
  created_by: string
  due_date: string | null
  status: 'to_do' | 'in_progress' | 'completed' | 'cancel' | 'archived'
  visibility: 'private' | 'team' | 'specific_users'
  team_id: string | null
  type_id: number | null
  company_id: string | null
  created_at: string
  updated_at: string
  creator_name?: string
  team_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  company?: { id: string; name: string; color?: string } | null
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>
  assignees?: Array<{ id: string; user_id: string; user_name?: string }>
  checklist_items?: Array<any>
  checklist_completed?: number
  checklist_total?: number
}

interface Team {
  id: string
  name: string
}

interface UserRecord {
  id: string
  full_name: string | null
  email: string
}

interface TodoStatusRecord {
  id: number
  slug: string
  title: string
  color: string
  show_in_kanban: boolean
  sort_order: number
}

// Fallback when DB has no todo_statuses
const DEFAULT_KANBAN_COLUMNS = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
]
const DEFAULT_ALL_STATUSES = [
  { slug: 'to_do', title: 'To Do' },
  { slug: 'in_progress', title: 'In Progress' },
  { slug: 'completed', title: 'Completed' },
  { slug: 'cancel', title: 'Cancel' },
  { slug: 'archived', title: 'Archived' },
]
// All statuses with color for kanban columns when filter is active (including cancel, archived)
const DEFAULT_ALL_STATUS_COLUMNS = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
  { id: 'cancel', title: 'Cancel', color: '#8c8c8c' },
  { id: 'archived', title: 'Archived', color: '#595959' },
]

// Kanban Card Component
function KanbanCard({ todo, onEdit, onDelete }: { todo: TodoRecord; onEdit: (todo: TodoRecord) => void; onDelete: (id: number) => void }) {
  const router = useRouter()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'private':
        return 'default'
      case 'team':
        return 'blue'
      case 'specific_users':
        return 'green'
      default:
        return 'default'
    }
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        size="small"
        style={{
          marginBottom: 12,
          cursor: 'grab',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          maxWidth: '300px',
          width: '100%',
        }}
        {...listeners}
      >
        <Flex justify="space-between" align="center">
          <Text 
            strong 
            style={{ fontSize: 14, flex: 1, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/tickets/${todo.id}`)
            }}
          >
            {todo.title} 
          </Text>
          <Dropdown
            menu={{
              items: [
                // {
                //   key: 'view',
                //   label: 'View Details',
                //   icon: <EyeOutlined />,
                //   onClick: () => router.push(`/tickets/${todo.id}`),
                // },
                {
                  key: 'edit',
                  label: 'Edit',
                  icon: <EditOutlined />,
                  onClick: () => onEdit(todo),
                },
                {
                  key: 'delete',
                  label: 'Delete',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: 'Delete Ticket',
                      content: 'Are you sure?',
                      okText: 'Yes',
                      cancelText: 'No',
                      onOk: () => onDelete(todo.id),
                    })
                  },
                },
              ],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="large"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        </Flex>

        <Flex gap={5} wrap="wrap" style={{ maxWidth: '100%', marginBottom: 8 }}>
          {todo.visibility!=='team' && (
          <Tag color={getVisibilityColor(todo.visibility)} style={{ fontSize: 11 }}>
              {todo.visibility === 'specific_users' ? 'Specific Users' : todo.visibility.toUpperCase()}
            </Tag>
          )}
          {todo.team_name && <Tag color="blue" style={{ fontSize: 11 }}>Team {todo.team_name}</Tag>}
          {todo.type && (
            <Tag color={todo.type.color} style={{ fontSize: 11 }}>
              {todo.type.title}
            </Tag>
          )}
          {todo.company && (
            <Tag
              color={todo.company.color ? undefined : 'cyan'}
              style={{ fontSize: 11, ...(todo.company.color ? { backgroundColor: todo.company.color, borderColor: todo.company.color, color: '#fff' } : {}) }}
            >
              {todo.company.name}
            </Tag>
          )}
          {todo.tags && todo.tags.length > 0 && (
            <Flex gap={4} wrap="wrap">
              {todo.tags.map((t) => (
                <Tag
                  key={t.id}
                  color={t.color ? undefined : 'default'}
                  style={{ fontSize: 11, ...(t.color ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' } : {}) }}
                >
                  {t.name}
                </Tag>
              ))}
            </Flex>
          )}
        </Flex>

       

        {Number(todo.checklist_total) > 0 ? (
          <Tag color="green" style={{ fontSize: 11, marginBottom: 8 }}>
            Checklist: {todo.checklist_completed}/{todo.checklist_total}
          </Tag>
        ) : null}


        

        {todo.assignees && todo.assignees.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Avatar.Group size="small" maxCount={3}>
              {todo.assignees.map((assignee) => (
                <Tooltip key={assignee.id} title={assignee.user_name}>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
              ))}
            </Avatar.Group>
          </div>
        )}


        {todo.due_date && (
          <div style={{ marginTop: 8 }}>
            <Tag
              color={dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? 'error' : 'default'}
              style={{ fontSize: 11 }}
            >
              Due Date: <DateDisplay date={todo.due_date} />
            </Tag>
          </div>
        )}

{todo.updated_at && (
          <div style={{ marginTop: 8 }}>
            <Tag
              color={dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? 'error' : 'default'}
              style={{ fontSize: 11 }}
            >
              
              Updated At: <DateDisplay date={todo.updated_at} />
            </Tag>
          </div>
        )}


        <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
          By {todo.creator_name}
        </div>
      </Card>
    </div>
  )
}

// Kanban Column Component
function KanbanColumn({
  column,
  todos,
  onEdit,
  onDelete,
}: {
  column: { id: string; title: string; color: string }
  todos: TodoRecord[]
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}) {
  // Filter todos by status
  let columnTodos = todos.filter((todo) => todo.status === column.id)
  

  
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <div style={{ minWidth: 320, flexShrink: 0, marginRight: 16 }}>
      <Card
        style={{
          height: 'calc(100vh - 200px)',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
          border: isOver ? `2px solid ${column.color}` : undefined,
        }}
        headStyle={{ backgroundColor: column.color }}
        bodyStyle={{ flex: 1, overflow: 'auto', padding: 0, position: 'relative' }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>{column.title}</Text>
              <Badge count={columnTodos.length} style={{ backgroundColor: column.color }} />
            </Space>
          </div>
        }
      >
        <div
          ref={setNodeRef}
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: '100%',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <SortableContext items={columnTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {columnTodos.length === 0 ? (
              <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description={`No ${column.title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <>
                {columnTodos.map((todo) => (
                  <KanbanCard key={todo.id} todo={todo} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </>
            )}
          </SortableContext>
        </div>
      </Card>
    </div>
  )
}

export default function TodosContent({ user: currentUser }: TodosContentProps) {
  const [collapsed, setCollapsed] = useState(false)
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
  const [statusColumns, setStatusColumns] = useState<{ id: string; title: string; color: string }[]>(DEFAULT_KANBAN_COLUMNS)
  const [allStatusColumns, setAllStatusColumns] = useState<{ id: string; title: string; color: string }[]>(DEFAULT_ALL_STATUS_COLUMNS)
  const [allStatuses, setAllStatuses] = useState<{ slug: string; title: string }[]>(DEFAULT_ALL_STATUSES)
  const [filterStatus, setFilterStatus] = useState<string[]>(DEFAULT_KANBAN_COLUMNS.map((c) => c.id))
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterCompanyId, setFilterCompanyId] = useState<string | undefined>(undefined)
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [ticketAttachmentsFromDb, setTicketAttachmentsFromDb] = useState<{ id: string; file_url: string; file_name: string; file_path: string }[]>([])
  const [newTicketAttachments, setNewTicketAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
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

  // Kolom kanban yang ditampilkan: saat filter status aktif pakai semua status (termasuk cancel/archived), else pakai statusColumns (show_in_kanban saja)
  const columnsToShow = useMemo(
    () => (filterStatus.length > 0 ? allStatusColumns.filter((c) => filterStatus.includes(c.id)) : statusColumns),
    [filterStatus, allStatusColumns, statusColumns]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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

      const ticketIds = (todosData || []).map((t: any) => t.id)
      const { data: ticketTagsData } = ticketIds.length > 0
        ? await supabase
            .from('ticket_tags')
            .select('ticket_id, tag_id, tags(id, name, slug, color)')
            .in('ticket_id', ticketIds)
        : { data: [] }
      const tagsByTicketId: Record<number, Array<{ id: string; name: string; slug: string; color?: string }>> = {}
      ;(ticketTagsData || []).forEach((row: any) => {
        if (!row.tags) return
        if (!tagsByTicketId[row.ticket_id]) tagsByTicketId[row.ticket_id] = []
        tagsByTicketId[row.ticket_id].push(row.tags)
      })

      const todosWithAssignees = await Promise.all(
        (todosData || []).map(async (todo: any) => {
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

          const completedCount = (checklistData || []).filter((item: any) => item.is_completed).length
          const totalCount = checklistData?.length || 0

          return {
            ...todo,
            creator_name: todo.creator?.full_name || todo.creator?.email || 'Unknown',
            team_name: todo.team?.name || null,
            tags: tagsByTicketId[todo.id] || [],
            assignees: (assigneesData || []).map((assignee: any) => ({
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
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch tickets')
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
    } catch (error: any) {
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
    } catch (error: any) {
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
        setStatusColumns(
          list.filter((s) => s.show_in_kanban).map((s) => ({ id: s.slug, title: s.title, color: s.color }))
        )
        setAllStatusColumns(list.map((s) => ({ id: s.slug, title: s.title, color: s.color })))
        setAllStatuses(list.map((s) => ({ slug: s.slug, title: s.title })))
        setFilterStatus(kanbanSlugs)
      }
    } catch (error: any) {
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    console.log('handleDragEnd', event)
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const todoId = active.id as number
    var newStatus = over.id as string


       // Allow drop on any visible column (when filter active: includes cancel/archived; else: show_in_kanban only)
    if (!columnsToShow.some((c) => c.id === newStatus)) {
      const todo = todos.find((t) => t.id === Number(newStatus))
      if (todo) {
        newStatus = todo?.status as string
      } else {
        return
      }
    }

    // Optimistic update
    setTodos((prevTodos) =>
      prevTodos.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t))
    )

    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', todoId)

      if (error) throw error

      message.success('Ticket status updated successfully')
    } catch (error: any) {
      message.error(error.message || 'Failed to update ticket status')
      // Revert optimistic update
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
    } catch (e) {
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
    } catch (error: any) {
      message.error(error.message || 'Failed to delete ticket')
    }
  }

  const handleSubmit = async (values: any) => {
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
        due_date: values.due_date ? values.due_date.toISOString() : null,
      }

      if (editingTodo) {
        const { error } = await supabase
          .from('tickets')
          .update(todoData)
          .eq('id', editingTodo.id)

        if (error) throw error

        if (values.visibility === 'specific_users') {
          await supabase
            .from('todo_assignees')
            .delete()
            .eq('todo_id', editingTodo.id)

          if (selectedAssignees.length > 0) {
            const assigneesToInsert = selectedAssignees.map((userId) => ({
              todo_id: editingTodo.id,
              user_id: userId,
            }))

            const { error: assigneesError } = await supabase
              .from('todo_assignees')
              .insert(assigneesToInsert)

            if (assigneesError) throw assigneesError
          }
        } else {
          await supabase
            .from('todo_assignees')
            .delete()
            .eq('todo_id', editingTodo.id)
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
              uploaded_by: currentUser.id,
            }))
          )
        }

        message.success('Ticket updated successfully')
      } else {
        const { data: newTodo, error } = await supabase
          .from('tickets')
          .insert({
            ...todoData,
            created_by: currentUser.id,
          })
          .select()
          .single()

        if (error) throw error

        if (values.visibility === 'specific_users' && selectedAssignees.length > 0) {
          const assigneesToInsert = selectedAssignees.map((userId) => ({
            todo_id: newTodo.id,
            user_id: userId,
          }))

          const { error: assigneesError } = await supabase
            .from('todo_assignees')
            .insert(assigneesToInsert)

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
              uploaded_by: currentUser.id,
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
    } catch (error: any) {
      message.error(error.message || 'Failed to save todo')
    }
  }

  const activeTodo = activeId ? filteredTodos.find((t) => t.id === activeId) : null
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>
                My Tickets
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} loading={loading}>
                Add Ticket
              </Button>
            </div>

            <Flex gap="middle" wrap="wrap" align="center" style={{ marginBottom: 16 }}>
              <Space wrap align="center">
                <FilterOutlined style={{ color: '#8c8c8c' }} />
                <Select
                  mode="multiple"
                  placeholder="Status (all)"
                  allowClear
                  style={{ minWidth: 180 }}
                  value={filterStatus}
                  onChange={(v) => setFilterStatus(v ?? [])}
                  options={allStatuses.map((s) => ({ value: s.slug, label: s.title }))}
                  maxTagCount="responsive"
                />
                <Select
                  placeholder="Type"
                  allowClear
                  style={{ minWidth: 140 }}
                  value={filterTypeId}
                  onChange={setFilterTypeId}
                >
                  {ticketTypes.map((t) => (
                    <Option key={t.id} value={t.id}>
                      <Space>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            backgroundColor: t.color,
                          }}
                        />
                        {t.title}
                      </Space>
                    </Option>
                  ))}
                </Select>
                <Select
                  placeholder="Company"
                  allowClear
                  style={{ minWidth: 160 }}
                  value={filterCompanyId}
                  onChange={setFilterCompanyId}
                >
                  {companies.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {c.name}
                    </Option>
                  ))}
                </Select>
                <Select
                  mode="multiple"
                  placeholder="Tags"
                  allowClear
                  style={{ minWidth: 180 }}
                  value={filterTagIds}
                  onChange={setFilterTagIds}
                  optionLabelProp="label"
                  maxTagCount="responsive"
                >
                  {allTags.map((t) => (
                    <Option key={t.id} value={t.id} label={t.name}>
                      {t.name}
                    </Option>
                  ))}
                </Select>
                <DatePicker.RangePicker
                  value={filterDateRange}
                  onChange={(dates) => setFilterDateRange(dates)}
                  allowClear
                  style={{ minWidth: 240 }}
                  placeholder={['Start date', 'End date']}
                />
                <Input
                  placeholder="Search title or description..."
                  allowClear
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  style={{ minWidth: 220 }}
                />
                {hasActiveFilters && (
                  <Button type="link" size="small" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </Space>
              {hasActiveFilters && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Showing {filteredTodos.length} of {todos.length} tickets
                </Text>
              )}
            </Flex>

            {loading ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin size="large" tip="Loading tasks..." />
              </div>
            ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  paddingBottom: 8,
                  margin: -4,
                }}
              >
                {columnsToShow.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    todos={filteredTodos}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeTodo ? (
                  <Card
                    size="small"
                    style={{
                      width: 280,
                      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    }}
                    bodyStyle={{ padding: 12 }}
                  >
                    <Text strong>{activeTodo.title}</Text>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
            )}
          </Card>

          <Modal
            title={editingTodo ? 'Edit Ticket' : 'Create Ticket'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
              setSelectedAssignees([])
              setSelectedTagIds([])
            }}
            footer={null}
            width={700}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter ticket title!' }]}
              >
                <Input placeholder="Ticket Title" />
              </Form.Item>

              <Form.Item name="description" label="Description">
                <CommentWysiwyg ticketId={editingTodo?.id} placeholder="Ticket Description" height="160px" />
              </Form.Item>

              <Form.Item label="Attachments">
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {ticketAttachmentsFromDb
                    .filter((a) => !deletedTicketAttachmentIds.includes(a.id))
                    .map((a) => (
                      <Space key={a.id} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <PaperClipOutlined /> {a.file_name}
                        </a>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeletedTicketAttachmentIds((prev) => [...prev, a.id])} />
                      </Space>
                    ))}
                  {newTicketAttachments.map((a, i) => (
                    <Space key={`new-${i}`} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PaperClipOutlined /> {a.file_name}
                      </a>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setNewTicketAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
                    </Space>
                  ))}
                  <input type="file" multiple style={{ display: 'none' }} id="ticket-files-input" onChange={(e) => { handleTicketFilesSelected(e.target.files); e.target.value = '' }} />
                  <Button icon={<PaperClipOutlined />} onClick={() => document.getElementById('ticket-files-input')?.click()}>
                    Attach files
                  </Button>
                </Space>
              </Form.Item>

              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select>
                  {allStatuses.map((s) => (
                    <Option key={s.slug} value={s.slug}>
                      {s.title}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="type_id" label="Type">
                <Select placeholder="Select type" allowClear>
                  {ticketTypes.map((t) => (
                    <Option key={t.id} value={t.id}>
                      <Space>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            backgroundColor: t.color,
                          }}
                        />
                        {t.title}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="company_id" label="Company">
                <Select placeholder="Select company" allowClear>
                  {companies.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {c.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="Tags">
                <Select
                  mode="multiple"
                  placeholder="Select tags"
                  value={selectedTagIds}
                  onChange={setSelectedTagIds}
                  optionLabelProp="label"
                  allowClear
                >
                  {allTags.map((t) => (
                    <Option key={t.id} value={t.id} label={t.name}>
                      {t.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="visibility" label="Visibility" rules={[{ required: true }]}>
                <Select
                  onChange={(value) => {
                    if (value !== 'specific_users') {
                      setSelectedAssignees([])
                    }
                  }}
                >
                  <Option value="private">Private</Option>
                  <Option value="team">Team</Option>
                  <Option value="specific_users">Specific Users</Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues.visibility !== currentValues.visibility
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue('visibility') === 'team' ? (
                    <Form.Item name="team_id" label="Team" rules={[{ required: true }]}>
                      <Select placeholder="Select Team">
                        {teams.map((team) => (
                          <Option key={team.id} value={team.id}>
                            {team.name}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ) : null
                }
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues.visibility !== currentValues.visibility
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue('visibility') === 'specific_users' ? (
                    <Form.Item
                      label="Assign To Users"
                      required
                      validateStatus={
                        getFieldValue('visibility') === 'specific_users' && selectedAssignees.length === 0
                          ? 'error'
                          : ''
                      }
                      help={
                        getFieldValue('visibility') === 'specific_users' && selectedAssignees.length === 0
                          ? 'Please select at least one user!'
                          : ''
                      }
                    >
                      <Select
                        mode="multiple"
                        placeholder="Select Users"
                        value={selectedAssignees}
                        onChange={setSelectedAssignees}
                        optionLabelProp="label"
                      >
                        {users.map((user) => (
                          <Option key={user.id} value={user.id} label={user.full_name || user.email}>
                            {user.full_name || user.email}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ) : null
                }
              </Form.Item>

              <Form.Item name="due_date" label="Due Date">
                <DatePicker
                  style={{ width: '100%' }}
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  placeholder="Select Due Date"
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingTodo ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                      setSelectedAssignees([])
                      setSelectedTagIds([])
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </Layout>
    </Layout>
  )
}
