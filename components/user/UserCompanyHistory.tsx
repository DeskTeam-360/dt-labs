'use client'

import { Card, Empty, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

const { Text } = Typography

type Row = {
  id: string
  from_company: { id: string; name: string } | null
  to_company: { id: string; name: string } | null
  source: string
  actor: string | null
  ticket_id: number | null
  note: string | null
  created_at: string
}

/** Where a change came from, in words a person can read. */
const SOURCE: Record<string, string> = {
  admin_edit: 'Edited by an admin',
  company_leader: 'Picked as company leader',
  email_sender: 'Sent an email (company matched)',
  email_cc: 'CC on an email',
  email_cc_reply: 'Replied as a CC',
  email_cc_external: 'CC on an external ticket',
  email_cc_new_ticket: 'CC on a new ticket',
  portal_cc: 'CC added in a portal reply',
  freshdesk_import: 'Freshdesk import',
}

/** Every change of this person's company: when, from where to where, and what caused it. */
export default function UserCompanyHistory({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/users/${userId}/company-history`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((j: Row[]) => {
        if (!cancelled) setRows(Array.isArray(j) ? j : [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <Card title="Company history" size="small" style={{ marginTop: 16 }}>
      <Table<Row>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No company change recorded yet. History starts from now." /> }}
        columns={[
          { title: 'When', dataIndex: 'created_at', width: 170, render: (v: string) => dayjs(v).format('MMM DD, YYYY HH:mm') },
          {
            title: 'Change',
            key: 'change',
            render: (_: unknown, r) => (
              <>
                {r.from_company ? <Tag>{r.from_company.name}</Tag> : <Text type="secondary">no company</Text>}
                <Text type="secondary"> to </Text>
                {r.to_company ? <Tag color="blue">{r.to_company.name}</Tag> : <Text type="secondary">no company</Text>}
              </>
            ),
          },
          {
            title: 'Cause',
            key: 'cause',
            render: (_: unknown, r) => (
              <>
                {SOURCE[r.source] ?? r.source}
                {r.actor ? <Text type="secondary"> · by {r.actor}</Text> : null}
                {r.ticket_id ? (
                  <a href={`/tickets/${r.ticket_id}`} target="_blank" rel="noopener noreferrer"> · ticket #{r.ticket_id}</a>
                ) : null}
              </>
            ),
          },
        ]}
      />
    </Card>
  )
}
