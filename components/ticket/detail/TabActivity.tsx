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

export default function TabActivity({ ticketId }: { ticketId: number }) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TicketActivityEntry[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/tickets/${ticketId}/activity`, { credentials: 'include' })
        if (!res.ok) throw new Error('fetch failed')
        const body = (await res.json()) as { data?: TicketActivityEntry[] }
        if (!cancelled) setRows(Array.isArray(body.data) ? body.data : [])
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ticketId])

  return (
    <Table<TicketActivityEntry>
      rowKey="id"
      loading={loading}
      pagination={false}
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
      ]}
    />
  )
}
