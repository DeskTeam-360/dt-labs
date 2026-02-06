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
} from 'antd'
import { CheckSquareOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import DateDisplay from '../DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography
const { Option } = Select

interface TabTicketsProps {
  companyData: { id: string; name?: string }
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
  creator_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  assignees?: Array<{ id: string; user_name?: string }>
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

export default function TabTickets({ companyData }: TabTicketsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [types, setTypes] = useState<TypeOption[]>([])
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterSearch, setFilterSearch] = useState('')

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
          creator:users!todos_created_by_fkey(id, full_name, email),
          type:ticket_types(id, title, slug, color)
        `)
        .eq('company_id', companyData.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const ticketIds = (ticketsData || []).map((t: any) => t.id)
      const assigneesByTicket: Record<number, Array<{ id: string; user_name?: string }>> = {}
      if (ticketIds.length > 0) {
        const { data: assigneesData } = await supabase
          .from('todo_assignees')
          .select(`
            todo_id,
            id,
            user:users!todo_assignees_user_id_fkey(id, full_name, email)
          `)
          .in('todo_id', ticketIds)
        ;(assigneesData || []).forEach((row: any) => {
          if (!assigneesByTicket[row.todo_id]) assigneesByTicket[row.todo_id] = []
          assigneesByTicket[row.todo_id].push({
            id: row.id,
            user_name: row.user?.full_name || row.user?.email || 'Unknown',
          })
        })
      }

      const list = (ticketsData || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        type_id: t.type_id,
        company_id: t.company_id,
        due_date: t.due_date,
        created_at: t.created_at,
        creator_name: t.creator?.full_name || t.creator?.email || 'Unknown',
        type: t.type || null,
        assignees: assigneesByTicket[t.id] || [],
      }))
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
        .select('slug, title')
        .order('sort_order', { ascending: true })
      if (error) throw error
      setStatuses((data || []) as StatusOption[])
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

  useEffect(() => {
    fetchTickets()
  }, [companyData?.id])

  useEffect(() => {
    fetchStatuses()
    fetchTypes()
  }, [])

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterStatus != null && filterStatus !== '') {
        if (t.status !== filterStatus) return false
      }
      if (filterTypeId != null) {
        if (t.type_id !== filterTypeId) return false
      }
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase()
        if (
          !t.title?.toLowerCase().includes(q) &&
          !(t.description || '').toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [tickets, filterStatus, filterTypeId, filterSearch])

  const columns: ColumnsType<TicketRecord> = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 72,
      render: (id: number) => (
        <Button type="link" size="small" onClick={() => router.push(`/tickets/${id}`)} style={{ padding: 0 }}>
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
          onClick={() => router.push(`/tickets/${record.id}`)}
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
      render: (status: string) => (
        <Tag color={status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'default'}>
          {status.replace('_', ' ')}
        </Tag>
      ),
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
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Row gutter={[16, 8]} align="middle">
          <Col>
            <Input
              placeholder="Search by title or description"
              prefix={<SearchOutlined />}
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
          </Col>
          <Col>
            <Select
              placeholder="Status"
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 140 }}
            >
              {statuses.map((s) => (
                <Option key={s.slug} value={s.slug}>
                  {s.title}
                </Option>
              ))}
            </Select>
          </Col>
          <Col>
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
          </Col>
          <Col>
            <Button onClick={fetchTickets}>Refresh</Button>
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
    </Card>
  )
}
