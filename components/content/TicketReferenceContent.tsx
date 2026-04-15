'use client'

import { ReadOutlined } from '@ant-design/icons'
import { Card, Empty,Layout, Spin, Tabs, Typography } from 'antd'
import { useEffect, useMemo,useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

interface TicketReferenceContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

type PriorityRow = { id: number; title: string; description?: string; color: string }
type TypeRow = { id: number; title: string; description?: string; color: string }
type StatusRow = {
  id: number
  title: string
  customer_title?: string
  description?: string
  color: string
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || res.statusText || 'Request failed')
  }
  return res.json()
}

function GlossaryBlock({
  title,
  color,
  body,
}: {
  title: string
  color: string
  body: string
}) {
  const stripe = color && /^#?[0-9A-Fa-f]{3,8}$/.test(color.trim()) ? (color.startsWith('#') ? color : `#${color}`) : '#1890ff'
  return (
    <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 4,
            minHeight: 40,
            borderRadius: 2,
            background: stripe,
            flexShrink: 0,
          }}
          aria-hidden
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: body.trim() ? 8 : 0 }}>
            {title}
          </Text>
          {body.trim() ? (
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{body.trim()}</Paragraph>
          ) : (
            <Text type="secondary" italic>
              No description yet. Admins can add one in Settings → Ticket attributes.
            </Text>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function TicketReferenceContent({ user: currentUser }: TicketReferenceContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [priorities, setPriorities] = useState<PriorityRow[]>([])
  const [types, setTypes] = useState<TypeRow[]>([])
  const [statuses, setStatuses] = useState<StatusRow[]>([])

  const isCustomer = (currentUser.role ?? '').toLowerCase() === 'customer'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [p, t, s] = await Promise.all([
          apiFetch<PriorityRow[]>('/api/ticket-priorities'),
          apiFetch<TypeRow[]>('/api/ticket-types'),
          apiFetch<StatusRow[]>('/api/ticket-statuses'),
        ])
        if (!cancelled) {
          setPriorities(Array.isArray(p) ? p : [])
          setTypes(Array.isArray(t) ? t : [])
          setStatuses(Array.isArray(s) ? s : [])
        }
      } catch {
        if (!cancelled) {
          setPriorities([])
          setTypes([])
          setStatuses([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const statusTitle = useMemo(
    () => (row: StatusRow) =>
      isCustomer && row.customer_title?.trim() ? row.customer_title.trim() : row.title,
    [isCustomer]
  )

  const tabItems = [
    {
      key: 'priorities',
      label: 'Priorities',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : priorities.length === 0 ? (
        <Empty description="No priorities defined" />
      ) : (
        priorities.map((row) => (
          <GlossaryBlock key={row.id} title={row.title} color={row.color} body={row.description ?? ''} />
        ))
      ),
    },
    {
      key: 'types',
      label: 'Ticket types',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : types.length === 0 ? (
        <Empty description="No ticket types defined" />
      ) : (
        types.map((row) => (
          <GlossaryBlock key={row.id} title={row.title} color={row.color} body={row.description ?? ''} />
        ))
      ),
    },
    {
      key: 'statuses',
      label: 'Statuses',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : statuses.length === 0 ? (
        <Empty description="No statuses defined" />
      ) : (
        statuses.map((row) => (
          <GlossaryBlock
            key={row.id}
            title={statusTitle(row)}
            color={row.color}
            body={row.description ?? ''}
          />
        ))
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <Title level={2} style={{ marginTop: 0 }}>
              <ReadOutlined style={{ marginRight: 12 }} />
              Reference
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 24 }}>
              What ticket priorities, types, and statuses mean in this workspace. Descriptions are maintained by admins in
              Settings.
            </Paragraph>
            <Tabs items={tabItems} />
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
