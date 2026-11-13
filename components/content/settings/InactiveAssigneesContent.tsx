'use client'

import { ArrowLeftOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, Layout, message, Select, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type Person = { id: string; name: string }
type Row = {
  id: number
  title: string
  status: string
  company: string | null
  created_at: string | null
  inactive: (Person & { status: string | null })[]
  active: Person[]
}

/** Open tickets whose assignee is no longer active: the admin sees them here and can hand each one to an active person. */
export default function InactiveAssigneesContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState<Person[]>([])
  const [pick, setPick] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tickets/inactive-assignees', { credentials: 'include' })
      const j = res.ok ? ((await res.json()) as { tickets: Row[] }) : { tickets: [] }
      setRows(j.tickets)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    fetch('/api/users', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; full_name?: string | null; email: string; role?: string | null }[]) =>
        setPeople(
          (Array.isArray(list) ? list : [])
            .filter((u) => ['admin', 'operations', 'manager', 'staff'].includes((u.role ?? '').toLowerCase()))
            .map((u) => ({ id: u.id, name: u.full_name || u.email }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => setPeople([]))
  }, [load])

  /** Takes the inactive people off the ticket and puts the chosen active person on it (the others stay). */
  const reassign = async (r: Row) => {
    const to = pick[r.id]
    if (!to) return
    setBusy(r.id)
    try {
      const assignees = [...new Set([...r.active.map((a) => a.id), to])]
      const res = await fetch(`/api/tickets/${r.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignees }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'Could not reassign the ticket')
      message.success(`Ticket #${r.id} reassigned`)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back</Button>
              </SpaNavLink>
              <Flex justify="space-between" align="center" wrap gap={12}>
                <Title level={2} style={{ margin: '8px 0 0' }}>Tickets with inactive assignees</Title>
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Refresh</Button>
              </Flex>
              <Text type="secondary">
                Open tickets that are assigned to someone who is no longer active. Nobody is watching them, so hand each one to an active person.
              </Text>
            </div>

            {rows.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                title={`${rows.length} open ${rows.length === 1 ? 'ticket is' : 'tickets are'} assigned to inactive people`}
              />
            ) : !loading ? (
              <Alert type="success" showIcon title="All open tickets are assigned to active people (or to no one)." />
            ) : null}

            <Table<Row>
              rowKey="id"
              size="middle"
              bordered
              loading={loading}
              dataSource={rows}
              pagination={rows.length > 20 ? { pageSize: 20 } : false}
              locale={{ emptyText: 'Nothing to fix.' }}
              columns={[
                {
                  title: 'Ticket',
                  key: 'ticket',
                  render: (_: unknown, r) => (
                    <Space orientation="vertical" size={0}>
                      <SpaNavLink href={`/tickets/${r.id}`}>#{r.id} {r.title}</SpaNavLink>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {r.company ?? 'No company'}{r.created_at ? ` - created ${dayjs(r.created_at).format('MMM D, YYYY')}` : ''}
                      </Text>
                    </Space>
                  ),
                },
                { title: 'Status', dataIndex: 'status', width: 130, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
                {
                  title: 'Inactive assignee',
                  key: 'inactive',
                  width: 240,
                  render: (_: unknown, r) => (
                    <Flex gap={4} wrap>
                      {r.inactive.map((p) => <Tag key={p.id} color="red" style={{ margin: 0 }}>{p.name}</Tag>)}
                    </Flex>
                  ),
                },
                {
                  title: 'Still active on it',
                  key: 'active',
                  width: 220,
                  render: (_: unknown, r) =>
                    r.active.length > 0 ? (
                      <Flex gap={4} wrap>{r.active.map((p) => <Tag key={p.id} style={{ margin: 0 }}>{p.name}</Tag>)}</Flex>
                    ) : (
                      <Text type="danger">No one</Text>
                    ),
                },
                {
                  title: 'Hand over to',
                  key: 'reassign',
                  width: 330,
                  render: (_: unknown, r) => (
                    <Space.Compact style={{ width: '100%' }}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Pick an active person"
                        style={{ width: '100%' }}
                        value={pick[r.id]}
                        onChange={(v) => setPick((s) => ({ ...s, [r.id]: v }))}
                        options={people.map((p) => ({ value: p.id, label: p.name }))}
                      />
                      <Button type="primary" disabled={!pick[r.id]} loading={busy === r.id} onClick={() => void reassign(r)}>Assign</Button>
                    </Space.Compact>
                  ),
                },
              ]}
            />
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
