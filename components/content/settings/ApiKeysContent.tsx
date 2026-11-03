'use client'

import { ArrowLeftOutlined, BarChartOutlined, CopyOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Drawer, Flex, Form, InputNumber, Layout, message, Modal, Popconfirm, Space, Statistic, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { API_SCOPES, isWriteScope } from '@/lib/api-scopes'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

type KeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  expires_at: string | null
  is_active: boolean
  rate_limit_per_hour: number
  connection: 'oauth' | 'manual'
  last_used_at: string | null
  created_at: string | null
  owner: string | null
  mine: boolean
  calls_24h: number
}

type Usage = {
  key: { id: string; name: string }
  keep_days: number
  summary: { total: number; last_24h: number; last_7d: number; refused: number }
  by_endpoint: Array<{ method: string; path: string; calls: number; refused: number; last_at: string }>
  by_day: Array<{ date: string; calls: number }>
  recent: Array<{ at: string | null; method: string; path: string; allowed: boolean; reason: string | null; ip: string | null; user_agent: string | null }>
}

const REASON_TEXT: Record<string, string> = {
  switched_off: 'Key switched off',
  expired: 'Key expired',
  missing_scope: 'No access to this endpoint',
  owner_not_allowed: 'Owner no longer allowed',
}


const copy = (text: string, ok: string) => {
  void navigator.clipboard.writeText(text).then(() => message.success(ok))
}

/** The access checkboxes, with the warning once a "Changes data" access is ticked. Used when making a key and when changing one. */
function ScopeFields() {
  return (
    <>
      <Form.Item name="scopes" label="What can this key do?" rules={[{ required: true, type: 'array', min: 1, message: 'Choose at least one access' }]}>
        <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {API_SCOPES.map((s) => (
            <Checkbox key={s.key} value={s.key}>
              <Text strong>{s.label}</Text>
              {isWriteScope(s.key) ? <Tag color="orange" style={{ marginLeft: 8 }}>Changes data</Tag> : null}
              <div><Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text></div>
              {s.endpoints.map((e) => (
                <div key={e.path}><Text code style={{ fontSize: 11 }}>{e.method} {e.path}</Text></div>
              ))}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(a, b) => a.scopes !== b.scopes}>
        {({ getFieldValue }) => {
          const writes = ((getFieldValue('scopes') as string[] | undefined) ?? []).filter(isWriteScope)
          if (!writes.length) return null
          const labels = writes.map((k) => API_SCOPES.find((s) => s.key === k)?.label ?? k)
          return (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 24 }}
              message="Do you authorize this key to change data?"
              description={`Anyone holding this key can make changes as you (${labels.join(', ')}), including emails and notifications sent to customers and your team. Only give it to an assistant you trust, and keep it secret. You can turn it off at any time.`}
            />
          )
        }}
      </Form.Item>
    </>
  )
}

/** Team Leaders, Operations and Admins make API keys with only the access they choose, for scripts and AI assistants. */
export default function ApiKeysContent({ user, embedded = false }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null }; embedded?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<KeyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [editForm] = Form.useForm<{ scopes: string[]; rate_limit_per_hour: number }>()
  const [editing, setEditing] = useState<KeyRow | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const isAdminUser = (user.role ?? '').toLowerCase() === 'admin'
  const mcpUrl = typeof window === 'undefined' ? '/api/mcp' : `${window.location.origin}/api/mcp`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/api-keys', { credentials: 'include' })
      const j = (await res.json()) as { keys?: KeyRow[]; error?: string }
      if (!res.ok) throw new Error(j.error || 'Failed to load keys')
      setRows(j.keys ?? [])
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/api-keys/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) message.error('Failed to update the key')
    void load()
  }

  const openEdit = (r: KeyRow) => {
    setEditing(r)
    editForm.setFieldsValue({ scopes: r.scopes, rate_limit_per_hour: r.rate_limit_per_hour })
  }

  const saveEdit = async () => {
    if (!editing) return
    const v = await editForm.validateFields()
    setEditSaving(true)
    try {
      const res = await fetch(`/api/api-keys/${editing.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes: v.scopes, rate_limit_per_hour: v.rate_limit_per_hour }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'Failed to update the key')
      message.success('Access updated. It applies to the next call the assistant makes.')
      setEditing(null)
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) message.error('Failed to delete the key')
    void load()
  }

  const openUsage = async (id: string) => {
    setUsageLoading(true)
    setUsage(null)
    try {
      const res = await fetch(`/api/api-keys/${id}/usage`, { credentials: 'include' })
      const j = (await res.json()) as Usage & { error?: string }
      if (!res.ok) throw new Error(j.error || 'Failed to load the usage')
      setUsage(j)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setUsageLoading(false)
    }
  }

  const scopeLabel = (k: string) => API_SCOPES.find((s) => s.key === k)?.label ?? k

  const inner = (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              {embedded ? null : (
                <SpaNavLink href="/settings">
                  <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Settings</Button>
                </SpaNavLink>
              )}
              {embedded ? null : <Title level={2} style={{ margin: '8px 0 0' }}>AI connections</Title>}
              <Text type="secondary">
                AI assistants connect to DeskTeam360 through MCP and sign in with their own approval page. There are no keys to copy: you choose the access when you approve, it acts as you, and you can change or switch it off here at any time.
              </Text>
            </div>

            <Card size="small" title="Connect an assistant">
              <Flex vertical gap={10}>
                <Flex align="center" gap={8} wrap>
                  <Text>Server address:</Text>
                  <Text code>{mcpUrl}</Text>
                  <Button size="small" icon={<CopyOutlined />} onClick={() => copy(mcpUrl, 'Address copied')}>Copy</Button>
                </Flex>
                <Flex vertical gap={4}>
                  <Text type="secondary"><b>Claude Desktop or claude.ai:</b> Settings, Connectors, add a custom connector with this address.</Text>
                  <Text type="secondary"><b>ChatGPT:</b> turn on Developer Mode, then add a connector with this address.</Text>
                  <Text type="secondary">
                    <b>Claude Code:</b> run <Text code>claude mcp add --transport http deskteam360 {mcpUrl}</Text>, then sign in from <Text code>/mcp</Text>.
                  </Text>
                </Flex>
                <Text type="secondary">An approval page opens where you sign in and choose the access. Anything that changes data has to be ticked on purpose. Any team member can approve; agents and managers can have one connection.</Text>
              </Flex>
            </Card>

            <Table<KeyRow>
              rowKey="id"
              size="middle"
              loading={loading}
              dataSource={rows}
              pagination={false}
              locale={{ emptyText: 'Nothing connected yet' }}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Name',
                  render: (_: unknown, r) => (
                    <div>
                      <Text strong>{r.name}</Text>{r.connection === 'manual' ? <Tooltip title="Made by hand before connections moved to OAuth. Delete it once nothing uses it."><Tag color="gold" style={{ marginLeft: 8 }}>Old key</Tag></Tooltip> : null}
                      <div><Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.key_prefix}…</Text></div>
                    </div>
                  ),
                },
                ...(isAdminUser ? [{ title: 'Owner', dataIndex: 'owner', render: (v: string | null, r: KeyRow) => (r.mine ? 'You' : (v ?? '-')) }] : []),
                {
                  title: 'Access',
                  dataIndex: 'scopes',
                  render: (v: string[]) => (
                    <Flex gap={4} wrap>
                      {v.map((s) => <Tag key={s} color={isWriteScope(s) ? 'orange' : undefined} style={{ margin: 0 }}>{scopeLabel(s)}</Tag>)}
                    </Flex>
                  ),
                },
                {
                  title: 'Expires',
                  dataIndex: 'expires_at',
                  render: (v: string | null) => {
                    if (!v) return '-'
                    const past = dayjs(v).isBefore(dayjs())
                    return past ? <Tag color="red" style={{ margin: 0 }}>Expired {dayjs(v).format('MMM D, YYYY')}</Tag> : dayjs(v).format('MMM D, YYYY')
                  },
                },
                { title: 'Last used', dataIndex: 'last_used_at', render: (v: string | null) => (v ? <Tooltip title={dayjs(v).format('MMM D, YYYY HH:mm')}>{dayjs(v).fromNow()}</Tooltip> : 'Never') },
                { title: 'Calls (24h)', dataIndex: 'calls_24h', width: 100, align: 'center' as const },
                {
                  title: 'Active',
                  dataIndex: 'is_active',
                  width: 80,
                  render: (v: boolean, r) => <Switch size="small" checked={v} onChange={(c) => void patch(r.id, { is_active: c })} />,
                },
                {
                  title: '',
                  width: 210,
                  render: (_: unknown, r) => (
                    <Space size={4}>
                      <Tooltip title="Change what this key can do">
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                      </Tooltip>
                      <Tooltip title="Usage: who called what, and when">
                        <Button size="small" icon={<BarChartOutlined />} onClick={() => void openUsage(r.id)} />
                      </Tooltip>
                      <Popconfirm title="Delete this key?" description="Anything using it stops working right away." okText="Delete" onConfirm={() => void remove(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
  )


  const overlays = (
    <>
      <Drawer
        title={usage ? `Usage of "${usage.key.name}"` : 'Usage'}
        open={usageLoading || usage !== null}
        onClose={() => setUsage(null)}
        size="large"
        loading={usageLoading}
      >
        {usage ? (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Flex gap={32} wrap>
              <Statistic title="Last 24 hours" value={usage.summary.last_24h} />
              <Statistic title="Last 7 days" value={usage.summary.last_7d} />
              <Statistic title={`All (last ${usage.keep_days} days)`} value={usage.summary.total} />
              <Statistic title="Refused" value={usage.summary.refused} styles={{ content: { color: usage.summary.refused ? '#cf1322' : undefined } }} />
            </Flex>

            <div>
              <Text strong>By endpoint</Text>
              <Table
                size="small"
                style={{ marginTop: 8 }}
                rowKey={(r) => `${r.method} ${r.path}`}
                dataSource={usage.by_endpoint}
                pagination={false}
                locale={{ emptyText: 'Not used yet' }}
                columns={[
                  { title: 'Endpoint', render: (_: unknown, r) => <Text code>{r.method} {r.path}</Text> },
                  { title: 'Calls', dataIndex: 'calls', width: 80, align: 'right' as const },
                  { title: 'Refused', dataIndex: 'refused', width: 90, align: 'right' as const, render: (v: number) => (v ? <Text type="danger">{v}</Text> : '-') },
                  { title: 'Last call', dataIndex: 'last_at', width: 160, render: (v: string) => dayjs(v).format('MMM D, HH:mm') },
                ]}
              />
            </div>

            <div>
              <Text strong>Per day (last 14 days, WIB)</Text>
              <Flex gap={6} wrap style={{ marginTop: 8 }}>
                {usage.by_day.length === 0 ? <Text type="secondary">No calls</Text> : usage.by_day.map((d) => <Tag key={d.date} style={{ margin: 0 }}>{dayjs(d.date).format('MMM D')}: {d.calls}</Tag>)}
              </Flex>
            </div>

            <div>
              <Text strong>Latest calls</Text>
              <Table
                size="small"
                style={{ marginTop: 8 }}
                rowKey={(r) => `${r.at}-${r.path}-${r.ip}`}
                dataSource={usage.recent}
                pagination={false}
                locale={{ emptyText: 'No calls yet' }}
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'When', dataIndex: 'at', width: 130, render: (v: string | null) => (v ? dayjs(v).format('MMM D, HH:mm:ss') : '-') },
                  { title: 'Endpoint', render: (_: unknown, r) => <Text code>{r.method} {r.path}</Text> },
                  { title: 'Result', render: (_: unknown, r) => (r.allowed ? <Tag color="green" style={{ margin: 0 }}>OK</Tag> : <Tag color="red" style={{ margin: 0 }}>{REASON_TEXT[r.reason ?? ''] ?? 'Refused'}</Tag>) },
                  { title: 'From', dataIndex: 'ip', render: (v: string | null) => v ?? '-' },
                ]}
              />
            </div>
          </Space>
        ) : null}
      </Drawer>

      <Modal title={editing ? `Access of "${editing.name}"` : ''} open={editing !== null} onCancel={() => setEditing(null)} onOk={() => void saveEdit()} confirmLoading={editSaving} okText="Save access" destroyOnHidden forceRender>
        <Form form={editForm} layout="vertical">
          <Form.Item name="rate_limit_per_hour" label="Calls per hour" rules={[{ required: true, type: 'number', min: 10, max: 10000, message: 'A whole number from 10 to 10000' }]} extra="Over this, the API answers 429 until older calls fall out of the hour. New keys start at 100.">
            <InputNumber min={10} max={10000} precision={0} style={{ width: 160 }} />
          </Form.Item>
          <ScopeFields />
        </Form>
      </Modal>
    </>
  )

  if (embedded) return <>{inner}{overlays}</>
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          {inner}
        </Content>
      </AdminMainColumn>
      {overlays}
    </Layout>
  )
}
