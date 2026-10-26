'use client'

import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { Badge, Button, Card, DatePicker, Empty, Flex, Input, Layout, message, Popconfirm, Segmented, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { useNotificationPoll } from '@/components/providers/NotificationPollProvider'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

type Item = {
  id: string
  ticketId: number
  ticketTitle: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string | null
  actorUserId: string
  actorName: string
}

/** The kinds of notification, in words a person recognises. */
const TYPES: { value: string; label: string; color: string; includes: string[] }[] = [
  { value: 'mention', label: 'Mentions (you were tagged)', color: 'purple', includes: ['mention'] },
  { value: 'assigned', label: 'Assigned to you', color: 'blue', includes: ['assignee_added', 'new_ticket_assignee'] },
  { value: 'new_comment', label: 'New comments and replies', color: 'green', includes: ['new_comment'] },
  { value: 'status_changed', label: 'Status changes', color: 'orange', includes: ['status_changed'] },
]

const typeMeta = (t: string) => {
  const m = TYPES.find((x) => x.includes.includes(t))
  return m ? { label: m.label.split(' (')[0], color: m.color } : { label: t, color: 'default' }
}

const decode = (text: string) => {
  const el = document.createElement('textarea')
  el.innerHTML = text
  return el.value
}

const PRESETS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'custom', label: 'Pick dates' },
]

export default function NotificationsContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const router = useRouter()
  const { refresh } = useNotificationPoll()
  const [collapsed, setCollapsed] = useState(false)

  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('all')
  const [types, setTypes] = useState<string[]>([])
  const [actor, setActor] = useState<string | undefined>(undefined)
  const [preset, setPreset] = useState('all')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [actors, setActors] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  /** The date filter as a start and end instant (local day bounds). */
  const dates = useMemo((): { from?: string; to?: string } => {
    if (preset === 'today') return { from: dayjs().startOf('day').toISOString(), to: dayjs().endOf('day').toISOString() }
    if (preset === '7') return { from: dayjs().subtract(6, 'day').startOf('day').toISOString(), to: dayjs().endOf('day').toISOString() }
    if (preset === '30') return { from: dayjs().subtract(29, 'day').startOf('day').toISOString(), to: dayjs().endOf('day').toISOString() }
    if (preset === 'custom' && range) return { from: range[0].startOf('day').toISOString(), to: range[1].endOf('day').toISOString() }
    return {}
  }, [preset, range])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (status !== 'all') qs.set('status', status)
      // "Assigned" stands for two stored types.
      const stored = types.flatMap((t) => TYPES.find((x) => x.value === t)?.includes ?? [])
      if (stored.length) qs.set('types', stored.join(','))
      if (actor) qs.set('actor', actor)
      if (dates.from) qs.set('from', dates.from)
      if (dates.to) qs.set('to', dates.to)
      if (search) qs.set('q', search)
      const res = await fetch(`/api/notifications/list?${qs.toString()}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('Could not load notifications')
      setItems((data.items ?? []) as Item[])
      setTotal(data.total ?? 0)
      setUnreadTotal(data.unread_total ?? 0)
      setActors(data.actors ?? [])
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, status, types, actor, dates, search])

  useEffect(() => {
    void load()
  }, [load])

  const resetPage = () => setPage(1)

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)))
    setUnreadTotal((n) => Math.max(0, n - items.filter((i) => ids.includes(i.id) && !i.read).length))
    void refresh()
  }

  const markAllRead = async () => {
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    message.success('All notifications marked as read')
    void load()
    void refresh()
  }

  const removeSelected = async () => {
    const res = await fetch('/api/notifications/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selected }),
    })
    const data = (await res.json().catch(() => ({}))) as { deleted?: number }
    if (!res.ok) {
      message.error('Could not delete notifications')
      return
    }
    message.success(`${data.deleted ?? 0} deleted`)
    setSelected([])
    void load()
    void refresh()
  }

  const open = (n: Item) => {
    void markRead([n.id])
    router.push(`/tickets/${n.ticketId}`)
  }

  const columns: ColumnsType<Item> = [
    {
      title: '',
      dataIndex: 'read',
      width: 28,
      render: (read: boolean) => (read ? null : <Badge status="processing" title="Unread" />),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 110,
      render: (t: string) => {
        const m = typeMeta(t)
        return <Tag color={m.color} style={{ margin: 0 }}>{m.label}</Tag>
      },
    },
    {
      title: 'Notification',
      key: 'text',
      render: (_: unknown, n) => (
        <Flex vertical gap={0}>
          <Text strong={!n.read}>{n.title}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{decode(n.body)}</Text>
        </Flex>
      ),
    },
    {
      title: 'Ticket',
      key: 'ticket',
      width: 280,
      ellipsis: true,
      render: (_: unknown, n) => (
        <Text>
          <Text type="secondary">#{n.ticketId}</Text> {n.ticketTitle}
        </Text>
      ),
    },
    { title: 'From', dataIndex: 'actorName', width: 150, ellipsis: true },
    {
      title: 'When',
      dataIndex: 'createdAt',
      width: 130,
      render: (v: string | null) =>
        v ? (
          <span title={dayjs(v).format('MMM DD, YYYY HH:mm')}>
            <Text type="secondary">{dayjs(v).fromNow()}</Text>
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_: unknown, n) =>
        n.read ? null : (
          <Button size="small" type="link" onClick={(e) => { e.stopPropagation(); void markRead([n.id]) }}>
            Mark read
          </Button>
        ),
    },
  ]

  const filtersActive = status !== 'all' || types.length > 0 || !!actor || preset !== 'all' || !!search

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Flex justify="space-between" align="flex-start" wrap gap={12}>
              <div>
                <Title level={2} style={{ margin: 0 }}>Notifications</Title>
                <Text type="secondary">Everything sent to you, not only the latest few. {unreadTotal > 0 ? `${unreadTotal} unread.` : 'You are all caught up.'}</Text>
              </div>
              <Space>
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Reload</Button>
                <Button disabled={unreadTotal === 0} onClick={() => void markAllRead()}>Mark all read</Button>
              </Space>
            </Flex>

            <Card size="small">
              <Flex vertical gap={12}>
                <Flex gap={12} wrap align="center">
                  <Segmented
                    value={status}
                    onChange={(v) => { setStatus(v as 'all' | 'unread' | 'read'); resetPage() }}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'unread', label: 'Unread' },
                      { value: 'read', label: 'Read' },
                    ]}
                  />
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Type: all kinds"
                    style={{ minWidth: 260, flex: 1, maxWidth: 420 }}
                    maxTagCount="responsive"
                    value={types}
                    onChange={(v) => { setTypes(v); resetPage() }}
                    options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  />
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="From: anyone"
                    style={{ width: 200 }}
                    value={actor}
                    onChange={(v) => { setActor(v); resetPage() }}
                    options={actors.map((a) => ({ value: a.id, label: a.name }))}
                  />
                </Flex>
                <Flex gap={12} wrap align="center">
                  <Segmented
                    value={preset}
                    onChange={(v) => { setPreset(String(v)); resetPage() }}
                    options={PRESETS}
                  />
                  {preset === 'custom' ? (
                    <RangePicker value={range} onChange={(v) => { setRange(v as [Dayjs, Dayjs] | null); resetPage() }} />
                  ) : null}
                  <Input.Search
                    allowClear
                    placeholder="Search text or ticket number, e.g. #52387"
                    style={{ width: 320 }}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value)
                      if (!e.target.value.trim()) { setSearch(''); resetPage() }
                    }}
                    onSearch={(v) => { setSearch(v.trim()); resetPage() }}
                  />
                  {filtersActive ? (
                    <Button
                      type="link"
                      onClick={() => {
                        setStatus('all'); setTypes([]); setActor(undefined); setPreset('all'); setRange(null); setQ(''); setSearch(''); resetPage()
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                </Flex>
              </Flex>
            </Card>

            {selected.length > 0 ? (
              <Flex gap={8} align="center">
                <Text>{selected.length} selected</Text>
                <Button size="small" onClick={() => { void markRead(selected); setSelected([]) }}>Mark read</Button>
                <Popconfirm title={`Delete ${selected.length} notification(s)?`} okText="Delete" onConfirm={() => void removeSelected()}>
                  <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
                </Popconfirm>
              </Flex>
            ) : null}

            <Table<Item>
              rowKey="id"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={items}
              rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
              onRow={(n) => ({ onClick: () => open(n), style: { cursor: 'pointer', background: n.read ? undefined : 'rgba(102, 126, 234, 0.06)' } })}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filtersActive ? 'No notification matches these filters' : 'No notifications yet'} /> }}
              scroll={{ x: 900 }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: [25, 50, 100],
                showTotal: (t) => `${t} notifications`,
                onChange: (p, ps) => { setPage(p); setPageSize(ps) },
              }}
            />
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
