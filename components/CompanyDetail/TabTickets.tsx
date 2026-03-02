'use client'

import {
  Card,
  Table,
  Select,
  Input,
  Space,
  Tag,
  Typography,
  Spin,
  Empty,
  Button,
  Row,
  Col,
  Modal,
  Form,
  Badge,
  Segmented,
  Dropdown,
  DatePicker,
  Flex,
  Avatar,
  Tooltip,
} from 'antd'
import {
  CheckSquareOutlined,
  SearchOutlined,
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  MoreOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import DateDisplay from '../DateDisplay'
import CommentWysiwyg from '../TodoDetail/CommentWysiwyg'
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
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography
const { Option } = Select
const { TextArea } = Input

const DEFAULT_KANBAN_COLUMNS = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
]
const DEFAULT_ALL_STATUS_COLUMNS = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
  { id: 'cancel', title: 'Cancel', color: '#8c8c8c' },
  { id: 'archived', title: 'Archived', color: '#595959' },
]

interface TabTicketsProps {
  companyData: { id: string; name?: string }
  currentUser?: User | null
  /** When set (e.g. /customer), ticket links go to basePath/tickets/[id] */
  basePath?: string
}

interface TicketRecord {
  id: number
  title: string
  description: string | null
  status: string
  type_id: number | null
  company_id: string | null
  due_date: string | null
  created_at: string
  updated_at?: string
  visibility?: string
  creator_name?: string
  team_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  company?: { id: string; name: string; color?: string } | null
  assignees?: Array<{ id: string; user_name?: string }>
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>
  checklist_completed?: number
  checklist_total?: number
}

interface StatusOption {
  slug: string
  title: string
}

interface TypeOption {
  id: number
  title: string
  slug: string
  color: string
}

interface KanbanColumnType {
  id: string
  title: string
  color: string
}

function TicketKanbanCard({
  ticket,
  onClick,
  onEdit,
  onDelete,
  basePath,
}: {
  ticket: TicketRecord
  onClick: () => void
  onEdit: (t: TicketRecord) => void
  onDelete: (id: number) => void
  basePath?: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getVisibilityColor = (v: string) => {
    switch (v) {
      case 'private': return 'default'
      case 'team': return 'blue'
      case 'specific_users': return 'green'
      default: return 'default'
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
          maxWidth: 300,
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
              onClick()
            }}
          >
            {ticket.title || 'Untitled'}
          </Text>
          <Dropdown
            menu={{
              items: [
                { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit(ticket) },
                { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true, onClick: () => Modal.confirm({ title: 'Delete ticket?', okText: 'Delete', okButtonProps: { danger: true }, onOk: () => onDelete(ticket.id) }) },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" size="large" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
          </Dropdown>
        </Flex>

        <Flex gap={5} wrap="wrap" style={{ maxWidth: '100%', marginBottom: 8 }}>
          {ticket.visibility && ticket.visibility !== 'team' && (
            <Tag color={getVisibilityColor(ticket.visibility)} style={{ fontSize: 11 }}>
              {ticket.visibility === 'specific_users' ? 'Specific Users' : ticket.visibility.toUpperCase()}
            </Tag>
          )}
          {ticket.team_name && <Tag color="blue" style={{ fontSize: 11 }}>Team {ticket.team_name}</Tag>}
          {ticket.type && (
            <Tag color={ticket.type.color} style={{ fontSize: 11 }}>{ticket.type.title}</Tag>
          )}
          {ticket.company && (
            <Tag
              color={ticket.company.color ? undefined : 'cyan'}
              style={{ fontSize: 11, ...(ticket.company.color ? { backgroundColor: ticket.company.color, borderColor: ticket.company.color, color: '#fff' } : {}) }}
            >
              {ticket.company.name}
            </Tag>
          )}
          {ticket.tags && ticket.tags.length > 0 && (
            <Flex gap={4} wrap="wrap">
              {ticket.tags.map((t) => (
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

        {Number(ticket.checklist_total) > 0 && (
          <Tag color="green" style={{ fontSize: 11, marginBottom: 8 }}>
            Checklist: {ticket.checklist_completed ?? 0}/{ticket.checklist_total}
          </Tag>
        )}

        {ticket.assignees && ticket.assignees.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Avatar.Group size="small" maxCount={3}>
              {ticket.assignees.map((a) => (
                <Tooltip key={a.id} title={a.user_name}>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
              ))}
            </Avatar.Group>
          </div>
        )}

        {ticket.due_date && (
          <div style={{ marginTop: 8 }}>
            <Tag
              color={dayjs(ticket.due_date).isBefore(dayjs()) && ticket.status !== 'completed' && ticket.status !== 'cancel' ? 'error' : 'default'}
              style={{ fontSize: 11 }}
            >
              Due Date: <DateDisplay date={ticket.due_date} />
            </Tag>
          </div>
        )}

        {ticket.creator_name && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
            By {ticket.creator_name}
          </div>
        )}
      </Card>
    </div>
  )
}

function TicketKanbanColumn({
  column,
  tickets,
  onTicketClick,
  onEdit,
  onDelete,
  basePath,
}: {
  column: KanbanColumnType
  tickets: TicketRecord[]
  onTicketClick: (t: TicketRecord) => void
  onEdit: (t: TicketRecord) => void
  onDelete: (id: number) => void
  basePath?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div style={{ minWidth: 320, flexShrink: 0, marginRight: 16 }}>
      <Card
        style={{
          height: 'calc(100vh - 280px)',
          minHeight: 400,
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
              <Badge count={tickets.length} style={{ backgroundColor: column.color }} />
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
          <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tickets.length === 0 ? (
              <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description={`No ${column.title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              tickets.map((ticket) => (
                <TicketKanbanCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => onTicketClick(ticket)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  basePath={basePath}
                />
              ))
            )}
          </SortableContext>
        </div>
      </Card>
    </div>
  )
}

export default function TabTickets({ companyData, currentUser, basePath }: TabTicketsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [types, setTypes] = useState<TypeOption[]>([])
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string }>>([])
  const [filterStatus, setFilterStatus] = useState<string[]>(DEFAULT_KANBAN_COLUMNS.map((c) => c.id))
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterSearch, setFilterSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban')
  const [statusColumns, setStatusColumns] = useState<KanbanColumnType[]>(DEFAULT_KANBAN_COLUMNS)
  const [allStatusColumns, setAllStatusColumns] = useState<KanbanColumnType[]>(DEFAULT_ALL_STATUS_COLUMNS)
  const [allStatuses, setAllStatuses] = useState<Array<{ slug: string; title: string }>>(
    DEFAULT_ALL_STATUS_COLUMNS.map((c) => ({ slug: c.id, title: c.title }))
  )
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [form] = Form.useForm()

  const ticketDetailUrl = (id: number) => (basePath ? `${basePath}/tickets/${id}` : `/tickets/${id}`)

  const fetchTickets = async () => {
    if (!companyData?.id) return
    setLoading(true)
    try {
      const { data: ticketsData, error } = await supabase
        .from('tickets')
        .select(`
          id,
          title,
          description,
          status,
          type_id,
          company_id,
          due_date,
          created_at,
          updated_at,
          visibility,
          creator:users!todos_created_by_fkey(id, full_name, email),
          type:ticket_types(id, title, slug, color),
          company:companies(id, name, color),
          team:teams(id, name)
        `)
        .eq('company_id', companyData.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const ticketIds = (ticketsData || []).map((t: any) => t.id)
      const assigneesByTicket: Record<number, Array<{ id: string; user_name?: string }>> = {}
      const tagsByTicket: Record<number, Array<{ id: string; name: string; slug: string; color?: string }>> = {}
      const checklistByTicket: Record<number, { completed: number; total: number }> = {}

      if (ticketIds.length > 0) {
        const [assigneesRes, tagsRes] = await Promise.all([
          supabase.from('todo_assignees').select('todo_id, id, user:users!todo_assignees_user_id_fkey(id, full_name, email)').in('todo_id', ticketIds),
          supabase.from('ticket_tags').select('ticket_id, tag_id, tags(id, name, slug, color)').in('ticket_id', ticketIds),
        ])
        ;(assigneesRes.data || []).forEach((row: any) => {
          if (!assigneesByTicket[row.todo_id]) assigneesByTicket[row.todo_id] = []
          assigneesByTicket[row.todo_id].push({
            id: row.id,
            user_name: row.user?.full_name || row.user?.email || 'Unknown',
          })
        })
        ;(tagsRes.data || []).forEach((row: any) => {
          if (!row.tags) return
          if (!tagsByTicket[row.ticket_id]) tagsByTicket[row.ticket_id] = []
          tagsByTicket[row.ticket_id].push(row.tags)
        })
        for (const tid of ticketIds) {
          const { data: checklistData } = await supabase.from('todo_checklist').select('is_completed').eq('todo_id', tid)
          const total = checklistData?.length ?? 0
          const completed = checklistData?.filter((x: any) => x.is_completed).length ?? 0
          checklistByTicket[tid] = { completed, total }
        }
      }

      const list = (ticketsData || []).map((t: any) => {
        const cb = checklistByTicket[t.id] ?? { completed: 0, total: 0 }
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          type_id: t.type_id,
          company_id: t.company_id,
          due_date: t.due_date,
          created_at: t.created_at,
          updated_at: t.updated_at,
          visibility: t.visibility,
          creator_name: t.creator?.full_name || t.creator?.email || 'Unknown',
          team_name: t.team?.name || null,
          type: t.type || null,
          company: t.company || null,
          assignees: assigneesByTicket[t.id] || [],
          tags: tagsByTicket[t.id] || [],
          checklist_completed: cb.completed,
          checklist_total: cb.total,
        }
      })
      setTickets(list)
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('todo_statuses')
        .select('slug, title, customer_title, color, show_in_kanban, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      const list = (data || []) as Array<{ slug: string; title: string; customer_title?: string | null; color?: string; show_in_kanban?: boolean }>
      const displayTitle = (s: { title: string; customer_title?: string | null }) =>
        basePath && s.customer_title ? s.customer_title : s.title
      setStatuses(list.map((s) => ({ slug: s.slug, title: displayTitle(s) })))
      const kanbanCols = list.filter((s) => s.show_in_kanban !== false).map((s) => ({
        id: s.slug,
        title: displayTitle(s),
        color: s.color || '#d9d9d9',
      }))
      const allCols = list.map((s) => ({
        id: s.slug,
        title: displayTitle(s),
        color: s.color || '#d9d9d9',
      }))
      if (kanbanCols.length > 0) {
        setStatusColumns(kanbanCols)
        setFilterStatus(kanbanCols.map((c) => c.id))
      }
      if (allCols.length > 0) setAllStatusColumns(allCols)
      setAllStatuses(list.map((s) => ({ slug: s.slug, title: displayTitle(s) })))
    } catch {
      setStatuses([])
    }
  }

  const fetchTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_types')
        .select('id, title, slug, color')
        .order('sort_order', { ascending: true })
      if (error) throw error
      setTypes((data || []) as TypeOption[])
    } catch {
      setTypes([])
    }
  }

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, slug')
        .order('name')
      if (error) throw error
      setAllTags((data || []) as Array<{ id: string; name: string }>)
    } catch {
      setAllTags([])
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [companyData?.id])

  useEffect(() => {
    fetchStatuses()
    fetchTypes()
    fetchTags()
  }, [basePath])

  const hasActiveFilters =
    filterStatus.length > 0 ||
    filterTypeId != null ||
    filterSearch.trim() !== ''

  const clearFilters = () => {
    setFilterStatus(statusColumns.map((c) => c.id))
    setFilterTypeId(undefined)
    setFilterSearch('')
  }

  const columnsToShow = useMemo(
    () => (filterStatus.length > 0 ? allStatusColumns.filter((c) => filterStatus.includes(c.id)) : statusColumns),
    [filterStatus, allStatusColumns, statusColumns]
  )

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterStatus.length > 0 && !filterStatus.includes(t.status)) return false
      if (filterTypeId != null && t.type_id !== filterTypeId) return false
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase()
        if (!t.title?.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [tickets, filterStatus, filterTypeId, filterSearch])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const ticketId = active.id as number
    let newStatus = over.id as string
    if (!columnsToShow.some((c) => c.id === newStatus)) {
      const ticket = filteredTickets.find((t) => t.id === Number(newStatus))
      if (ticket) newStatus = ticket.status
      else return
    }

    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    )

    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', ticketId)
      if (error) throw error
    } catch {
      fetchTickets()
    }
  }

  const handleCreate = () => {
    setEditingTicket(null)
    setSelectedTagIds([])
    form.resetFields()
    form.setFieldsValue({
      status: statuses[0]?.slug ?? 'to_do',
      company_id: companyData.id,
    })
    setModalVisible(true)
  }

  const handleEdit = async (ticket: TicketRecord) => {
    setEditingTicket(ticket)
    form.setFieldsValue({
      title: ticket.title,
      description: ticket.description || '',
      status: ticket.status,
      type_id: ticket.type_id ?? undefined,
      company_id: companyData.id,
      due_date: ticket.due_date ? dayjs(ticket.due_date) : null,
    })
    const { data: tagRows } = await supabase
      .from('ticket_tags')
      .select('tag_id')
      .eq('ticket_id', ticket.id)
    setSelectedTagIds((tagRows || []).map((r: any) => r.tag_id))
    setModalVisible(true)
  }

  const handleDelete = async (ticketId: number) => {
    try {
      await supabase.from('todo_assignees').delete().eq('todo_id', ticketId)
      await supabase.from('tickets').delete().eq('id', ticketId)
      fetchTickets()
    } catch {
      fetchTickets()
    }
  }

  const handleSubmit = async (values: any) => {
    if (!currentUser) return
    setSaving(true)
    try {
      const payload = {
        title: values.title?.trim() || 'Untitled',
        description: values.description || null,
        status: values.status || 'to_do',
        type_id: values.type_id ?? null,
        company_id: companyData.id,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        visibility: 'private',
      }

      if (editingTicket) {
        await supabase.from('tickets').update(payload).eq('id', editingTicket.id)
        if (!basePath) {
          await supabase.from('ticket_tags').delete().eq('ticket_id', editingTicket.id)
          if (selectedTagIds.length > 0) {
            await supabase.from('ticket_tags').insert(
              selectedTagIds.map((tagId) => ({ ticket_id: editingTicket.id, tag_id: tagId }))
            )
          }
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('tickets')
          .insert({ ...payload, created_by: currentUser.id })
          .select()
          .single()
        if (error) throw error
        if (!basePath && inserted && selectedTagIds.length > 0) {
          await supabase.from('ticket_tags').insert(
            selectedTagIds.map((tagId) => ({ ticket_id: inserted.id, tag_id: tagId }))
          )
        }
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedTagIds([])
      fetchTickets()
    } catch (e: any) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const activeTicket = activeId ? filteredTickets.find((t) => t.id === activeId) : null

  const columns: ColumnsType<TicketRecord> = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 72,
      render: (id: number) => (
        <Button type="link" size="small" onClick={() => router.push(ticketDetailUrl(id))} style={{ padding: 0 }}>
          #{id}
        </Button>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record) => (
        <Button
          type="link"
          style={{ padding: 0, height: 'auto', fontWeight: 500 }}
          onClick={() => router.push(ticketDetailUrl(record.id))}
        >
          {title}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const col = allStatusColumns.find((c) => c.id === status)
        const label = col ? col.title : status.replace('_', ' ')
        const color = col?.color ? undefined : status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'default'
        return (
          <Tag color={color} style={col?.color ? { backgroundColor: col.color, borderColor: col.color, color: '#fff' } : undefined}>
            {label}
          </Tag>
        )
      },
    },
    {
      title: 'Type',
      key: 'type',
      width: 120,
      render: (_, r) =>
        r.type ? (
          <Tag color={r.type.color || undefined}>{r.type.title}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Due date',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 120,
      render: (d: string | null) => (d ? <DateDisplay date={d} /> : '—'),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (d: string) => <DateDisplay date={d} />,
    },
    {
      title: 'Created by',
      key: 'creator_name',
      width: 120,
      render: (_, r) => <Text type="secondary">{r.creator_name || '—'}</Text>,
    },
    {
      title: 'Assignees',
      key: 'assignees',
      width: 100,
      render: (_, r) =>
        r.assignees && r.assignees.length > 0 ? (
          <Space size={4}>
            <UserOutlined />
            <Text type="secondary">{r.assignees.length}</Text>
          </Space>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Row gutter={[16, 8]} align="middle" justify="space-between">
          <Col>
            <Space wrap align="center">
              <FilterOutlined style={{ color: '#8c8c8c' }} />
              <Input
                placeholder="Search by title or description"
                prefix={<SearchOutlined />}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                allowClear
                style={{ width: 260 }}
              />
              <Select
                mode="multiple"
                placeholder="Status (all)"
                allowClear
                value={filterStatus}
                onChange={(v) => setFilterStatus(v ?? [])}
                style={{ minWidth: 180 }}
                options={allStatuses.map((s) => ({ value: s.slug, label: s.title }))}
                maxTagCount="responsive"
              />
              <Select
                placeholder="Type"
                allowClear
                value={filterTypeId}
                onChange={setFilterTypeId}
                style={{ width: 160 }}
              >
                {types.map((t) => (
                  <Option key={t.id} value={t.id}>
                    {t.title}
                  </Option>
                ))}
              </Select>
              <Button onClick={fetchTickets}>Refresh</Button>
              {hasActiveFilters && (
                <Button type="link" size="small" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </Space>
            {hasActiveFilters && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Showing {filteredTickets.length} of {tickets.length} tickets
              </Text>
            )}
          </Col>
          <Col>
            <Space>
              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as 'table' | 'kanban')}
                options={[
                  { value: 'kanban', label: <><AppstoreOutlined /> Kanban</> },
                  { value: 'table', label: <><UnorderedListOutlined /> Table</> },
                ]}
              />
              {currentUser && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  Create Ticket
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        <Spin spinning={loading}>
          {viewMode === 'table' ? (
            <Table
              size="small"
              columns={columns}
              dataSource={filteredTickets}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} tickets`,
              }}
              locale={{ emptyText: 'No tickets for this company' }}
            />
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
                  <TicketKanbanColumn
                    key={column.id}
                    column={column}
                    tickets={filteredTickets.filter((t) => t.status === column.id)}
                    onTicketClick={(t) => router.push(ticketDetailUrl(t.id))}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    basePath={basePath}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeTicket ? (
                  <Card size="small" style={{ width: 280, boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }} bodyStyle={{ padding: 12 }}>
                    <Text strong>{activeTicket.title}</Text>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </Spin>
      </Space>

      <Modal
        title={editingTicket ? 'Edit Ticket' : 'Create Ticket'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields() }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
            <Input placeholder="Ticket title" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <CommentWysiwyg ticketId={editingTicket?.id} placeholder="Description" height="120px" />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select>
              {statuses.map((s) => (
                <Option key={s.slug} value={s.slug}>{s.title}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="type_id" label="Type">
            <Select placeholder="Select type" allowClear>
              {types.map((t) => (
                <Option key={t.id} value={t.id}>
                  <Space>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: t.color }} />
                    {t.title}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          {!basePath && (
            <Form.Item label="Tags">
              <Select
                mode="multiple"
                placeholder="Select tags"
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                allowClear
              >
                {allTags.map((t) => (
                  <Option key={t.id} value={t.id}>{t.name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="due_date" label="Due Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                {editingTicket ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => { setModalVisible(false); form.resetFields() }}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
