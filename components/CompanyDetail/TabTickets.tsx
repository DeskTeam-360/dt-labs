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
  Button,
  Row,
  Col,
  Modal,
  Form,
  message,
} from 'antd'
import {
  SearchOutlined,
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FilterOutlined,
  SyncOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DateDisplay from '../DateDisplay'
import CommentWysiwyg from '../TicketDetail/CommentWysiwyg'
import { DatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography
const { Option } = Select

interface TabTicketsProps {
  companyData: { id: string; name?: string }
  currentUser?: { id: string; email?: string | null; name?: string | null } | null
  basePath?: string
}

interface TicketRecord {
  id: number
  title: string
  description: string | null
  status: string
  visibility?: 'private' | 'team' | 'specific_users' | 'public'
  type_id: number | null
  priority_id: number | null
  company_id: string | null
  due_date: string | null
  created_at: string
  updated_at?: string
  creator_name?: string
  by_label?: string
  team_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  priority?: { id: number; title: string; slug: string; color: string } | null
  company?: { id: string; name: string; color?: string } | null
  assignees?: Array<{ id: string; user_name?: string }>
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>
  checklist_completed?: number
  checklist_total?: number
  has_unread_replies?: boolean
}

interface StatusOption {
  slug: string
  title: string
  color?: string
}

interface TypeOption {
  id: number
  title: string
  slug: string
  color: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function TabTickets({ companyData, currentUser, basePath }: TabTicketsProps) {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [types, setTypes] = useState<TypeOption[]>([])
  const [priorities, setPriorities] = useState<TypeOption[]>([])
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string }>>([])
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterSearch, setFilterSearch] = useState('')
  /** Filter tiket by tanggal **created** (server, pakai date_from / date_to API). */
  const [filterDateRange, setFilterDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [form] = Form.useForm()
  const [syncingEmail, setSyncingEmail] = useState(false)

  const ticketDetailUrl = (id: number) => (basePath ? `${basePath}/tickets/${id}` : `/tickets/${id}`)

  const handleSyncEmail = async () => {
    setSyncingEmail(true)
    try {
      const res = await fetch('/api/email/sync-inbox', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      const parts = []
      if (data.addedCount > 0) parts.push(`${data.addedCount} reply(ies)`)
      if (data.createdCount > 0) parts.push(`${data.createdCount} new ticket(s)`)
      message.success(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Synced. No new emails.')
      fetchTickets()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to sync email')
    } finally {
      setSyncingEmail(false)
    }
  }

  const fetchTickets = useCallback(async () => {
    if (!companyData?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('company_id', companyData.id)
      if (filterDateRange) {
        params.set('date_from', filterDateRange[0].startOf('day').toISOString())
        params.set('date_to', filterDateRange[1].endOf('day').toISOString())
      }
      const qs = params.toString()
      const data = await apiFetch<TicketRecord[]>(`/api/tickets?${qs}`)
      const list = Array.isArray(data) ? data : []
      setTickets(
        list.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          type_id: t.type_id,
          priority_id: t.priority_id,
          company_id: t.company_id,
          due_date: t.due_date,
          created_at: t.created_at,
          updated_at: t.updated_at,
          creator_name: t.creator_name,
          by_label: t.by_label,
          team_name: t.team_name,
          type: t.type,
          priority: t.priority,
          company: t.company,
          assignees: t.assignees || [],
          tags: t.tags || [],
          checklist_completed: t.checklist_completed ?? 0,
          checklist_total: t.checklist_total ?? 0,
          has_unread_replies: t.has_unread_replies,
        }))
      )
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [companyData?.id, filterDateRange])

  const fetchLookup = async () => {
    try {
      const data = await apiFetch<{
        statuses: Array<{ slug: string; title: string; color?: string }>
        ticketTypes: TypeOption[]
        ticketPriorities: TypeOption[]
        tags: Array<{ id: string; name: string }>
      }>('/api/tickets/lookup')
      setStatuses(data.statuses || [])
      setTypes(data.ticketTypes || [])
      setPriorities(data.ticketPriorities || [])
      setAllTags(data.tags || [])
      const slugs = (data.statuses || []).map((s) => s.slug)
      if (slugs.length) {
        setFilterStatus((prev) => (prev.length === 0 ? slugs : prev))
      }
    } catch {
      setStatuses([])
      setTypes([])
      setPriorities([])
      setAllTags([])
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    fetchLookup()
  }, [])

  const statusFilterNarrowed = useMemo(() => {
    if (statuses.length === 0) return false
    if (filterStatus.length === 0) return false
    if (filterStatus.length < statuses.length) return true
    const set = new Set(filterStatus)
    return !statuses.every((s) => set.has(s.slug))
  }, [filterStatus, statuses])

  const hasDateFilter = filterDateRange != null
  const hasActiveFilters =
    statusFilterNarrowed || filterTypeId != null || filterSearch.trim() !== '' || hasDateFilter

  const clearFilters = () => {
    setFilterStatus(statuses.map((s) => s.slug))
    setFilterTypeId(undefined)
    setFilterSearch('')
    setFilterDateRange(null)
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterStatus.length > 0 && !filterStatus.includes(t.status)) return false
      if (filterTypeId != null && t.type_id !== filterTypeId) return false
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase()
        if (!t.title?.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q))
          return false
      }
      return true
    })
  }, [tickets, filterStatus, filterTypeId, filterSearch])

  const handleCreate = () => {
    setEditingTicket(null)
    setSelectedTagIds([])
    form.resetFields()
    form.setFieldsValue({
      status: statuses[0]?.slug ?? 'to_do',
      visibility: 'public',
      company_id: companyData.id,
    })
    setModalVisible(true)
  }

  const handleEdit = (ticket: TicketRecord) => {
    setEditingTicket(ticket)
    form.setFieldsValue({
      title: ticket.title,
      description: ticket.description || '',
      status: ticket.status,
      visibility: ticket.visibility,
      type_id: ticket.type_id ?? undefined,
      priority_id: ticket.priority_id ?? undefined,
      company_id: companyData.id,
      due_date: ticket.due_date ? dayjs(ticket.due_date) : null,
    })
    setSelectedTagIds(ticket.tags?.map((t) => t.id) || [])
    setModalVisible(true)
  }

  const handleDelete = async (ticketId: number) => {
    try {
      await apiFetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      message.success('Ticket deleted')
      fetchTickets()
    } catch (err: unknown) {
      message.error((err as Error).message || 'Failed to delete')
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
        priority_id: values.priority_id ?? null,
        company_id: companyData.id,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        visibility: editingTicket ? (values.visibility ?? editingTicket.visibility ?? 'public') : (values.visibility ?? 'public'),
        tag_ids: selectedTagIds,
      }

      if (editingTicket) {
        await apiFetch(`/api/tickets/${editingTicket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Ticket updated')
      } else {
        await apiFetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Ticket created')
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedTagIds([])
      fetchTickets()
    } catch (err: unknown) {
      message.error((err as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const getStatusLabel = (status: string) => {
    const s = statuses.find((x) => x.slug === status)
    return s?.title || status.replace('_', ' ')
  }

  const columns: ColumnsType<TicketRecord> = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 72,
      render: (id: number) => (
        <Button
          type="link"
          size="small"
          onClick={() => router.push(ticketDetailUrl(id))}
          style={{ padding: 0 }}
        >
          #{id}
        </Button>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: TicketRecord) => (
        <Button
          type="link"
          style={{ padding: 0, height: 'auto', fontWeight: 500 }}
          onClick={() => router.push(ticketDetailUrl(record.id))}
        >
          {record.has_unread_replies && (
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#ff4d4f',
                marginRight: 6,
                verticalAlign: 'middle',
              }}
              title="Unread replies"
            />
          )}
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
        const s = statuses.find((x) => x.slug === status)
        const color = s?.color ? undefined : status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'default'
        return (
          <Tag color={color} style={s?.color ? { backgroundColor: s.color, borderColor: s.color, color: '#fff' } : undefined}>
            {getStatusLabel(status)}
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
      title: 'By',
      key: 'creator_name',
      width: 120,
      render: (_, r) => <Text type="secondary">{r.by_label || r.creator_name || '—'}</Text>,
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
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: 'Delete ticket?',
                okText: 'Delete',
                okButtonProps: { danger: true },
                onOk: () => handleDelete(record.id),
              })
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
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
                options={statuses.map((s) => ({ value: s.slug, label: s.title }))}
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
              <DatePicker.RangePicker
                allowClear
                value={filterDateRange}
                onChange={(dates) =>
                  setFilterDateRange(dates?.[0] && dates?.[1] ? [dates[0], dates[1]] : null)
                }
                format="YYYY-MM-DD"
                placeholder={['Created from', 'Created to']}
                style={{ width: 280 }}
                suffixIcon={<CalendarOutlined />}
              />
              <Button onClick={() => fetchTickets()}>Refresh</Button>
              {basePath && (
                <Button icon={<SyncOutlined />} onClick={handleSyncEmail} loading={syncingEmail}>
                  Sync Email
                </Button>
              )}
              {hasActiveFilters && (
                <Button type="link" size="small" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </Space>
            {hasActiveFilters && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Showing {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
                {hasDateFilter ? ' (created in selected range)' : ''}
              </Text>
            )}
          </Col>
          <Col>
            {/* {currentUser && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Create Ticket
              </Button>
            )} */}
          </Col>
        </Row>

        <Spin spinning={loading}>
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
        </Spin>
      </Space>

      <Modal
        title={editingTicket ? 'Edit Ticket' : 'Create Ticket'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
        }}
        footer={null}
        width={600}
        centered
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
            <Input placeholder="Ticket title" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <CommentWysiwyg ticketId={editingTicket?.id} placeholder="Description" height="50px" />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select>
              {statuses.map((s) => (
                <Option key={s.slug} value={s.slug}>
                  {s.title}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="type_id" label="Type">
            <Select placeholder="Select type" allowClear>
              {types.map((t) => (
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
          </Form.Item>
          <Form.Item
            name="priority_id"
            label="Priority"
            rules={[{ required: true, message: 'Please select priority!' }]}
          >
            <Select placeholder="Select priority" allowClear>
              {priorities.map((p) => (
                <Option key={p.id} value={p.id}>
                  <Space>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: p.color,
                      }}
                    />
                    {p.title}
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
                  <Option key={t.id} value={t.id}>
                    {t.name}
                  </Option>
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
              <Button
                onClick={() => {
                  setModalVisible(false)
                  form.resetFields()
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
