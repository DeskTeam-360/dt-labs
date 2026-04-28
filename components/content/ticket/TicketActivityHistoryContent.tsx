'use client'

import 'dayjs/locale/en'

import { Card, Input, Layout, Pagination, Select, Space, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import TicketActivityActorAvatar from '@/components/ticket/TicketActivityActorAvatar'
import { TICKET_ACTIVITY_ACTIONS } from '@/lib/ticket-activity-actions'
import { formatTicketActivityAction } from '@/lib/ticket-activity-labels'
import { summarizeTicketActivityMetadata } from '@/lib/ticket-activity-metadata'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)
dayjs.locale('en')

const { Content } = Layout
const { Title, Text } = Typography

const PAGE_SIZE = 25

export type TicketActivityRow = {
  id: string
  ticket_id: number
  ticket_title: string
  action: string
  actor_role: string
  metadata: unknown
  created_at: string
  actor: { name: string | null; email: string | null; avatar_url?: string | null } | null
}

interface TicketActivityHistoryContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

export default function TicketActivityHistoryContent({ user: currentUser }: TicketActivityHistoryContentProps) {
  const router = useRouter()
  const isCustomer = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'customer'
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TicketActivityRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [actionType, setActionType] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const typeOptions = useMemo(
    () => [
      { value: '', label: 'All types' },
      ...TICKET_ACTIVITY_ACTIONS.map((a) => ({
        value: a,
        label: formatTicketActivityAction(a),
      })),
    ],
    []
  )

  useEffect(() => {
    const id = setTimeout(() => {
      const next = searchInput.trim()
      setDebouncedSearch((prev) => {
        if (prev !== next) setPage(1)
        return next
      })
    }, 400)
    return () => clearTimeout(id)
  }, [searchInput])

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const offset = (page - 1) * PAGE_SIZE
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (actionType) params.set('action', actionType)
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/ticket-activity?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('fetch failed')
      const body = (await res.json()) as { data?: TicketActivityRow[]; total?: number }
      setRows(Array.isArray(body.data) ? body.data : [])
      setTotal(typeof body.total === 'number' ? body.total : 0)
    } catch {
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, actionType, debouncedSearch])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn
        collapsed={collapsed}
        user={currentUser}
        style={{
          // borderRadius: '16px 0 0 16px',
          overflow: 'hidden',
        }}
      >
        <Content style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <Title level={2} style={{ margin: 0 }}>
              Ticket activity history
            </Title>
            <Text type="secondary">Ticket changes, comments, and automation (scoped to your access).</Text>
          </div>

          <Space wrap style={{ marginBottom: 16 }} size={12}>
            <Select
              placeholder="Activity type"
              allowClear
              style={{ minWidth: 200 }}
              options={typeOptions}
              value={actionType}
              onChange={(v) => {
                setActionType(typeof v === 'string' ? v : '')
                setPage(1)
              }}
            />
            <Input.Search
              allowClear
              placeholder="Search ticket #, title, actor email/name, or detail text"
              style={{ width: 360, maxWidth: '100%' }}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Space>

          <Card styles={{ body: { padding: 0 } }}>
            <Table<TicketActivityRow>
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={rows}
              locale={{ emptyText: 'No activity yet' }}
              onRow={(record) => ({
                onClick: () => router.push(`/tickets/${record.ticket_id}`),
                style: { cursor: 'pointer' },
              })}
              columns={[
                {
                  title: 'By',
                  key: 'actor',
                  width: 220,
                  render: (_, r) => {
                    const label = r.actor?.name?.trim() || r.actor?.email?.trim() || null
                    const role = r.actor_role
                    if (!label) {
                      if (role === 'system') {
                        return (
                          <Space size="small">
                            <TicketActivityActorAvatar size={28} actorRole={role} />
                            <Text type="secondary">System</Text>
                          </Space>
                        )
                      }
                      if (role === 'automation') {
                        return (
                          <Space size="small">
                            <TicketActivityActorAvatar size={28} actorRole={role} />
                            <Text type="secondary">Automation</Text>
                          </Space>
                        )
                      }
                      return <Text type="secondary">—</Text>
                    }
                    return (
                      <Space size="small" align="center">
                        <TicketActivityActorAvatar
                          size={28}
                          actorRole={role}
                          avatarUrl={r.actor?.avatar_url}
                          name={r.actor?.name}
                          email={r.actor?.email}
                        />
                        <span>
                          {label}
                          {role === 'customer' && (
                            <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                              (customer)
                            </Text>
                          )}
                        </span>
                      </Space>
                    )
                  },
                },
                {
                  title: 'Activity',
                  dataIndex: 'action',
                  width: 180,
                  render: (_: string, r) => formatTicketActivityAction(r.action, r.actor_role),
                },
                {
                  title: 'Details',
                  key: 'details',
                  ellipsis: true,
                  render: (_, r) => (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {summarizeTicketActivityMetadata(r.action, r.metadata) || '—'}
                    </Text>
                  ),
                },
                {
                  title: 'Ticket',
                  key: 'ticket',
                  render: (_, r) => (
                    <div>
                      <Text strong>#{r.ticket_id}</Text>
                      <div
                        style={{
                          color: '#595959',
                          fontSize: 13,
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.ticket_title || '(No title)'}
                      </div>
                    </div>
                  ),
                },
               
                {
                  title: 'Time',
                  dataIndex: 'created_at',
                  width: 140,
                  render: (iso: string) => (
                    <span title={iso ? dayjs(iso).format('LLL') : ''}>
                      {iso ? dayjs(iso).fromNow() : '—'}
                    </span>
                  ),
                },
              ]}
            />

            {total > PAGE_SIZE && (
              <div style={{ padding: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Pagination
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onChange={(p) => setPage(p)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </Card>

          <div style={{ marginTop: 16 }}>
            <SpaNavLink href="/tickets">← Back to tickets</SpaNavLink>
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
