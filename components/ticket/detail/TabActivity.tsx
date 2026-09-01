'use client'

import 'dayjs/locale/en'

import { Space, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useEffect, useState } from 'react'

import TicketActivityActorAvatar from '@/components/ticket/TicketActivityActorAvatar'
import { formatTicketActivityAction } from '@/lib/ticket-activity-labels'
import { summarizeTicketActivityMetadata } from '@/lib/ticket-activity-metadata'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)
dayjs.locale('en')

const { Text } = Typography

export type TicketActivityEntry = {
  id: string
  ticket_id: number | null
  actor_user_id: string | null
  actor_role: string
  action: string
  metadata: unknown
  related_comment_id: string | null
  created_at: string
  actor: { name: string | null; email: string | null; avatar_url?: string | null } | null
}

const PAGE_SIZE = 20

export default function TabActivity({
  ticketId,
  refreshKey = 0,
}: {
  ticketId: number
  /** Bump after ticket edits so new rows (e.g. status → ticket_updated) appear without reload. */
  refreshKey?: number
}) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TicketActivityEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const offset = (page - 1) * PAGE_SIZE
        const res = await fetch(`/api/tickets/${ticketId}/activity?limit=${PAGE_SIZE}&offset=${offset}`, { credentials: 'include' })
        if (!res.ok) throw new Error('fetch failed')
        const body = (await res.json()) as { data?: TicketActivityEntry[]; total?: number }
        if (!cancelled) {
          setRows(Array.isArray(body.data) ? body.data : [])
          setTotal(typeof body.total === 'number' ? body.total : 0)
        }
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ticketId, refreshKey, page])

  return (
    <Table<TicketActivityEntry>
      rowKey="id"
      loading={loading}
      pagination={{
        current: page,
        pageSize: PAGE_SIZE,
        total,
        onChange: (p) => setPage(p),
        showSizeChanger: false,
        showTotal: (t) => `${t} activities`,
      }}
      size="small"
      dataSource={rows}
      locale={{ emptyText: 'No activity yet' }}
      scroll={{ x: 'max-content' }}
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
          title: 'Time',
          dataIndex: 'created_at',
          width: 140,
          render: (iso: string) => (
            <span title={iso ? dayjs(iso).format('LLL') : ''}>{iso ? dayjs(iso).fromNow() : '—'}</span>
          ),
        },
        {
          title: 'Activity',
          dataIndex: 'action',
          width: 180,
          render: (_: string, r) => formatTicketActivityAction(r.action, r.actor_role, r.metadata),
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
      ]}
    />
  )
}
