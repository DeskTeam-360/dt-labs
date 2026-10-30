'use client'

import { ArrowLeftOutlined, BarChartOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Drawer, Flex, Form, Input, Layout, message, Modal, Popconfirm, Select, Space, Statistic, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { API_SCOPES, buildSkillMarkdown, isWriteScope } from '@/lib/api-scopes'
import { downloadTextFile } from '@/lib/crawl-groups'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

type KeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  expires_at: string | null
  is_active: boolean
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

type FormValues = { name: string; scopes: string[]; expires_in_days: number }

const EXPIRY_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
]

const copy = (text: string, ok: string) => {
  void navigator.clipboard.writeText(text).then(() => message.success(ok))
}

/** Team Leaders, Operations and Admins make API keys with only the access they choose, for scripts and AI assistants. */
export default function ApiKeysContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<KeyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<{ key: string; scopes: string[]; name: string } | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const isAdminUser = (user.role ?? '').toLowerCase() === 'admin'

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

  const create = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      })
      const j = (await res.json()) as { key?: string; error?: string }
      if (!res.ok || !j.key) throw new Error(j.error || 'Failed to create the key')
      setCreating(false)
      setCreated({ key: j.key, scopes: v.scopes, name: v.name })
      form.resetFields()
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/api-keys/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) message.error('Failed to update the key')
    void load()
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

  const skillFor = (scopes: string[]) => buildSkillMarkdown(scopes, window.location.origin)
  const scopeLabel = (k: string) => API_SCOPES.find((s) => s.key === k)?.label ?? k

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 1100 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Settings</Button>
              </SpaNavLink>
              <Flex justify="space-between" align="center" wrap gap={12}>
                <div>
                  <Title level={2} style={{ margin: '8px 0 0' }}>API Keys</Title>
                  <Text type="secondary">
                    Make a key with only the access you choose, to give to a script or an AI assistant. A key acts as you, can only do what you allowed (reading, or writing where you tick it), and stops at its expiry date.
                  </Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                  New API key
                </Button>
              </Flex>
            </div>

            <Table<KeyRow>
              rowKey="id"
              size="middle"
              loading={loading}
              dataSource={rows}
              pagination={false}
              locale={{ emptyText: 'No API keys yet' }}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Name',
                  render: (_: unknown, r) => (
                    <div>
                      <Text strong>{r.name}</Text>
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
                  width: 170,
                  render: (_: unknown, r) => (
                    <Space size={4}>
                      <Tooltip title="Usage: who called what, and when">
                        <Button size="small" icon={<BarChartOutlined />} onClick={() => void openUsage(r.id)} />
                      </Tooltip>
                      <Tooltip title="Download skill.md for this key's access">
                        <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTextFile('skill.md', skillFor(r.scopes), 'text/markdown')} />
                      </Tooltip>
                      <Tooltip title="Copy skill.md">
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copy(skillFor(r.scopes), 'skill.md copied')} />
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
        </Content>
      </AdminMainColumn>

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

      <Modal title="New API key" open={creating} onCancel={() => setCreating(false)} onOk={() => void create()} confirmLoading={saving} okText="Create key" destroyOnHidden forceRender>
        <Form form={form} layout="vertical" initialValues={{ scopes: [], expires_in_days: 90 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the key a name' }]} extra="So you remember what it is for, e.g. Claude assistant.">
            <Input maxLength={120} />
          </Form.Item>
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
          <Form.Item name="expires_in_days" label="Expires after" rules={[{ required: true }]}>
            <Select options={EXPIRY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={created ? `Key "${created.name}" is ready` : ''}
        open={created !== null}
        onCancel={() => setCreated(null)}
        footer={<Button type="primary" onClick={() => setCreated(null)}>Done</Button>}
        width={640}
        destroyOnHidden
      >
        {created ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Alert type="warning" showIcon title="Copy the key now. It is shown only this once; if you lose it, make a new key." />
            <Card size="small">
              <Flex justify="space-between" align="center" gap={8}>
                <Text code style={{ wordBreak: 'break-all' }}>{created.key}</Text>
                <Button icon={<CopyOutlined />} onClick={() => copy(created.key, 'Key copied')}>Copy</Button>
              </Flex>
            </Card>
            <div>
              <Text strong>Give it to an AI assistant</Text>
              <Paragraph type="secondary" style={{ margin: '4px 0 8px' }}>
                The skill.md explains the endpoints this key can use. Give the assistant the skill file and the key (never put the key inside skill.md).
              </Paragraph>
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => downloadTextFile('skill.md', skillFor(created.scopes), 'text/markdown')}>Download skill.md</Button>
                <Button icon={<CopyOutlined />} onClick={() => copy(skillFor(created.scopes), 'skill.md copied')}>Copy skill.md</Button>
              </Space>
            </div>
          </Space>
        ) : null}
      </Modal>
    </Layout>
  )
}
