'use client'

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Button,
  Drawer,
  Empty,
  Layout,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

import RecurringTicketForm from './RecurringTicketForm'
import RecurringTicketRunsDrawer from './RecurringTicketRunsDrawer'

dayjs.extend(relativeTime)

const { Title, Text } = Typography

export interface RecurringTicketRow {
  id: string
  title: string
  description: string | null
  frequency: string
  specificDays: number[] | null
  specificDate: number | null
  intervalDays: number | null
  timeOfDay: string
  timezone: string
  startDate: string
  endDate: string | null
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  ticketStatus: string | null
  ticketPriority: number | null
  teamId: string | null
  companyId: string | null

  ticketTypeId: number | null
  contactUserId: string | null
  visibility: string
  createdAt: string
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays (Mon–Fri)',
  weekends: 'Weekends (Sat–Sun)',
  specific_days: 'Specific days',
  specific_date: 'Monthly date',
  interval: 'Every N days',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function freqLabel(row: RecurringTicketRow): string {
  switch (row.frequency) {
    case 'specific_days':
      return `Every ${(row.specificDays ?? []).map((d) => DAY_NAMES[d]).join(', ')}`
    case 'specific_date':
      return `Monthly on day ${row.specificDate ?? 1}`
    case 'interval':
      return `Every ${row.intervalDays ?? 1} day(s)`
    default:
      return FREQ_LABELS[row.frequency] ?? row.frequency
  }
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function RecurringTicketsContent({ user }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<RecurringTicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringTicketRow | null>(null)
  const [runsDrawer, setRunsDrawer] = useState<RecurringTicketRow | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recurring-tickets')
      const json = await res.json()
      setRows(json.data ?? [])
    } catch {
      messageApi.error('Failed to load recurring tickets')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleToggle = async (row: RecurringTicketRow, active: boolean) => {
    setToggling(row.id)
    try {
      const res = await fetch(`/api/recurring-tickets/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      })
      if (!res.ok) throw new Error()
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: active } : r)))
      messageApi.success(active ? 'Rule activated' : 'Rule paused')
    } catch {
      messageApi.error('Failed to update status')
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = (row: RecurringTicketRow) => {
    Modal.confirm({
      title: 'Delete recurring ticket?',
      content: `"${row.title}" will be permanently deleted. Tickets already created will remain.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        const res = await fetch(`/api/recurring-tickets/${row.id}`, { method: 'DELETE' })
        if (res.ok) {
          setRows((prev) => prev.filter((r) => r.id !== row.id))
          messageApi.success('Deleted')
        } else {
          messageApi.error('Failed to delete')
        }
      },
    })
  }

  const handleSaved = () => {
    setFormOpen(false)
    setEditing(null)
    fetchRules()
  }

  const handleRunNow = async (row: RecurringTicketRow) => {
    setRunning(row.id)
    try {
      const res = await fetch(`/api/recurring-tickets/${row.id}/run-now`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      messageApi.success(`Ticket created successfully`)
      fetchRules()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Failed to run')
    } finally {
      setRunning(null)
    }
  }

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, row: RecurringTicketRow) => (
        <div>
          <Text strong>{text}</Text>
          {row.description && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {row.description.slice(0, 80)}{row.description.length > 80 ? '…' : ''}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Priority',
      key: 'ticketPriority',
      render: (_: unknown, row: RecurringTicketRow) => {
        const p = row.ticketPriority && row.ticketPriority > 0 ? row.ticketPriority : null
        return p
          ? <Tag color="orange">#{p}</Tag>
          : <Text type="secondary">—</Text>
      },
    },
    {
      title: 'Frequency',
      key: 'frequency',
      render: (_: unknown, row: RecurringTicketRow) => (
        <Tag icon={<ClockCircleOutlined />} color="blue">
          {freqLabel(row)}
        </Tag>
      ),
    },
    {
      title: 'Time',
      key: 'time',
      render: (_: unknown, row: RecurringTicketRow) => (
        <Text>{row.timeOfDay} <Text type="secondary" style={{ fontSize: 11 }}>({row.timezone})</Text></Text>
      ),
    },
    {
      title: 'Next run',
      key: 'nextRunAt',
      render: (_: unknown, row: RecurringTicketRow) => {
        if (!row.isActive) return <Text type="secondary">Paused</Text>
        if (!row.nextRunAt) return <Text type="secondary">—</Text>
        const d = dayjs(row.nextRunAt)
        return (
          <Tooltip title={d.format('YYYY-MM-DD HH:mm:ss')}>
            <Text>{d.fromNow()}</Text>
          </Tooltip>
        )
      },
    },
    {
      title: 'Last run',
      key: 'lastRunAt',
      render: (_: unknown, row: RecurringTicketRow) => {
        if (!row.lastRunAt) return <Text type="secondary">Never</Text>
        return (
          <Tooltip title={dayjs(row.lastRunAt).format('YYYY-MM-DD HH:mm:ss')}>
            <Text type="secondary">{dayjs(row.lastRunAt).fromNow()}</Text>
          </Tooltip>
        )
      },
    },
    {
      title: 'Created',
      key: 'createdAt',
      render: (_: unknown, row: RecurringTicketRow) => (
        <Tooltip title={dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss')}>
          <Text type="secondary">{dayjs(row.createdAt).format('MMM D, YYYY')}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Active',
      key: 'isActive',
      render: (_: unknown, row: RecurringTicketRow) => (
        <Switch
          checked={row.isActive}
          loading={toggling === row.id}
          onChange={(v) => handleToggle(row, v)}
          checkedChildren={<PlayCircleOutlined />}
          unCheckedChildren={<PauseCircleOutlined />}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, row: RecurringTicketRow) => (
        <Space>
          <Tooltip title="Run now — create ticket immediately">
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={running === row.id}
              onClick={() => handleRunNow(row)}
            />
          </Tooltip>
          <Tooltip title="View run history">
            <Button
              icon={<EyeOutlined />}
              onClick={() => setRunsDrawer(row)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              icon={<EditOutlined />}
              onClick={() => { setEditing(row); setFormOpen(true) }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(row)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <div style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>Recurring Tickets</Title>
              <Text type="secondary">Automatically create tickets on a recurring schedule.</Text>
            </div>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchRules} loading={loading} />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setEditing(null); setFormOpen(true) }}
              >
                New recurring ticket
              </Button>
            </Space>
          </div>

          <Table
            dataSource={rows}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            locale={{ emptyText: <Empty description="No recurring tickets yet" /> }}
          />
        </div>

        <Modal
          open={formOpen}
          onCancel={() => { setFormOpen(false); setEditing(null) }}
          title={editing ? 'Edit recurring ticket' : 'New recurring ticket'}
          footer={null}
          width={620}
          destroyOnHidden
        >
          <RecurringTicketForm
            initialValues={editing}
            onSaved={handleSaved}
            onCancel={() => { setFormOpen(false); setEditing(null) }}
          />
        </Modal>

        <Drawer
          open={!!runsDrawer}
          onClose={() => setRunsDrawer(null)}
          title={runsDrawer ? `Run history — ${runsDrawer.title}` : 'Run history'}
          width={520}
          destroyOnHidden
        >
          {runsDrawer && <RecurringTicketRunsDrawer ruleId={runsDrawer.id} />}
        </Drawer>
      </AdminMainColumn>
    </Layout>
  )
}
