'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Layout,
  Card,
  Button,
  Typography,
  Table,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Checkbox,
  Select,
  message,
  Popconfirm,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import AdminSidebar from '../AdminSidebar'
import AdminMainColumn from '../AdminMainColumn'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

type RuleRow = {
  id: string
  name: string
  webhook_url_masked: string
  is_enabled: boolean
  filter: Record<string, unknown>
  sort_order: number
  created_at: string
  updated_at: string
}

interface SlackNotificationRulesContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

type Option = { label: string; value: string | number }

function filterFromApi(f: Record<string, unknown> | undefined) {
  const raw = f && typeof f === 'object' ? f : {}
  return {
    on_ticket_created: raw.on_ticket_created !== false,
    on_status_changed: raw.on_status_changed === true,
    on_client_reply: raw.on_client_reply === true,
    team_ids: Array.isArray(raw.team_ids) ? (raw.team_ids as string[]) : [],
    priority_ids: Array.isArray(raw.priority_ids) ? (raw.priority_ids as number[]) : [],
    company_ids: Array.isArray(raw.company_ids) ? (raw.company_ids as string[]) : [],
    type_ids: Array.isArray(raw.type_ids) ? (raw.type_ids as number[]) : [],
  }
}

export default function SlackNotificationRulesContent({ user }: SlackNotificationRulesContentProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<RuleRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RuleRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const [teamOpts, setTeamOpts] = useState<Option[]>([])
  const [priorityOpts, setPriorityOpts] = useState<Option[]>([])
  const [companyOpts, setCompanyOpts] = useState<Option[]>([])
  const [typeOpts, setTypeOpts] = useState<Option[]>([])

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/slack-notification-rules', { credentials: 'include' })
      const raw = await res.text()
      let data: unknown = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = null
      }
      if (!res.ok) {
        const errMsg =
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Failed to load rules (HTTP ${res.status})`
        throw new Error(errMsg)
      }
      setRules(Array.isArray(data) ? data : [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSelectData = useCallback(async () => {
    try {
      const [teamsRes, priRes, compRes, typRes] = await Promise.all([
        fetch('/api/teams', { credentials: 'include' }),
        fetch('/api/ticket-priorities', { credentials: 'include' }),
        fetch('/api/companies', { credentials: 'include' }),
        fetch('/api/ticket-types', { credentials: 'include' }),
      ])
      const teamsJson = teamsRes.ok ? await teamsRes.json() : []
      const priJson = priRes.ok ? await priRes.json() : []
      const compWrap = compRes.ok ? await compRes.json() : {}
      const typJson = typRes.ok ? await typRes.json() : []
      const compList = Array.isArray(compWrap.data) ? compWrap.data : []

      setTeamOpts(
        (Array.isArray(teamsJson) ? teamsJson : []).map((t: { id: string; name: string }) => ({
          label: t.name,
          value: t.id,
        }))
      )
      setPriorityOpts(
        (Array.isArray(priJson) ? priJson : []).map((p: { id: number; title: string }) => ({
          label: p.title,
          value: p.id,
        }))
      )
      setCompanyOpts(
        compList.map((c: { id: string; name: string }) => ({
          label: c.name,
          value: c.id,
        }))
      )
      setTypeOpts(
        (Array.isArray(typJson) ? typJson : []).map((t: { id: number; title: string }) => ({
          label: t.title,
          value: t.id,
        }))
      )
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    loadRules()
    loadSelectData()
  }, [loadRules, loadSelectData])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      name: '',
      webhook_url: '',
      is_enabled: true,
      sort_order: 0,
      on_ticket_created: true,
      on_status_changed: false,
      on_client_reply: false,
      team_ids: [],
      priority_ids: [],
      company_ids: [],
      type_ids: [],
    })
    setModalOpen(true)
  }

  const openEdit = (row: RuleRow) => {
    setEditing(row)
    const f = filterFromApi(row.filter)
    form.setFieldsValue({
      name: row.name,
      webhook_url: '',
      is_enabled: row.is_enabled,
      sort_order: row.sort_order,
      on_ticket_created: f.on_ticket_created,
      on_status_changed: f.on_status_changed,
      on_client_reply: f.on_client_reply,
      team_ids: f.team_ids,
      priority_ids: f.priority_ids,
      company_ids: f.company_ids,
      type_ids: f.type_ids,
    })
    setModalOpen(true)
  }

  const submit = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    const sortOrder =
      typeof v.sort_order === 'number' && !Number.isNaN(v.sort_order)
        ? v.sort_order
        : Number.parseInt(String(v.sort_order ?? '0'), 10) || 0
    const filter = {
      on_ticket_created: v.on_ticket_created !== false,
      on_status_changed: v.on_status_changed === true,
      on_client_reply: v.on_client_reply === true,
      team_ids: v.team_ids?.length ? v.team_ids : [],
      priority_ids: v.priority_ids?.length ? v.priority_ids : [],
      company_ids: v.company_ids?.length ? v.company_ids : [],
      type_ids: v.type_ids?.length ? v.type_ids : [],
    }
    setSaving(true)
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: v.name?.trim() || '',
          is_enabled: v.is_enabled !== false,
          sort_order: sortOrder,
          filter,
        }
        const w = typeof v.webhook_url === 'string' ? v.webhook_url.trim() : ''
        if (w.length > 0) body.webhook_url = w
        const res = await fetch(`/api/slack-notification-rules/${editing.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Save failed')
        message.success('Rule updated')
      } else {
        const res = await fetch('/api/slack-notification-rules', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: v.name?.trim() || '',
            webhook_url: v.webhook_url?.trim(),
            is_enabled: v.is_enabled !== false,
            sort_order: sortOrder,
            filter,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Create failed')
        message.success('Rule created')
      }
      setModalOpen(false)
      loadRules()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/slack-notification-rules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      message.success('Rule removed')
      loadRules()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const columns: ColumnsType<RuleRow> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (n: string) => n || <Text type="secondary">—</Text>,
    },
    {
      title: 'Webhook',
      dataIndex: 'webhook_url_masked',
      key: 'webhook_url_masked',
      render: (m: string) => <Text code>{m}</Text>,
    },
    {
      title: 'Events',
      key: 'events',
      render: (_, row) => {
        const f = filterFromApi(row.filter)
        return (
          <Space size={4} wrap>
            {f.on_ticket_created ? <Tag color="blue">Created</Tag> : null}
            {f.on_status_changed ? <Tag color="purple">Status</Tag> : null}
            {f.on_client_reply ? <Tag color="orange">Client reply</Tag> : null}
            {!f.on_ticket_created && !f.on_status_changed && !f.on_client_reply ? (
              <Text type="secondary">—</Text>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: 'Filters',
      key: 'filters',
      render: (_, row) => {
        const f = filterFromApi(row.filter)
        const parts: string[] = []
        if (f.team_ids.length) parts.push(`${f.team_ids.length} team(s)`)
        if (f.priority_ids.length) parts.push(`${f.priority_ids.length} priority`)
        if (f.company_ids.length) parts.push(`${f.company_ids.length} company`)
        if (f.type_ids.length) parts.push(`${f.type_ids.length} type`)
        return parts.length > 0 ? (
          <Text type="secondary">{parts.join(' · ')}</Text>
        ) : (
          <Text type="secondary">All tickets</Text>
        )
      },
    },
    {
      title: 'On',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      width: 72,
      render: (on: boolean) => (on ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Popconfirm title="Delete this rule?" onConfirm={() => remove(row.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={{ id: user.id, role: user.role ?? undefined }}>
        <Content style={{ padding: 24 }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={2} style={{ margin: 0 }}>
              Slack notifications
            </Title>
            <Text type="secondary">
              Post to a Slack channel (Incoming Webhook) when a ticket matches your filters and events.
            </Text>
          </div>

          <Card>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              In Slack: <Text strong>App</Text> → choose your workspace → <Text strong>Incoming Webhooks</Text> → add to a
              channel → copy the URL that starts with <Text code>https://hooks.slack.com/services/</Text>. One URL = one
              channel. Leave all team / priority / company / type filters empty so every ticket that matches the selected
              events is included.
            </Paragraph>
            <div style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add rule
              </Button>
            </div>
            <Table<RuleRow>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rules}
              pagination={false}
            />
          </Card>
        </Content>
      </AdminMainColumn>

      <Modal
        title={editing ? 'Edit rule' : 'New rule'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        confirmLoading={saving}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Label (optional)">
            <Input placeholder="e.g. Urgent → #alerts" maxLength={255} />
          </Form.Item>
          <Form.Item
            name="webhook_url"
            label={editing ? 'New webhook URL (optional)' : 'Incoming Webhook URL'}
            rules={
              editing
                ? []
                : [
                    { required: true, message: 'Webhook URL required' },
                    {
                      pattern: /^https:\/\/hooks\.slack\.com\/services\/.+/,
                      message: 'Must start with https://hooks.slack.com/services/',
                    },
                  ]
            }
            extra={
              editing ? (
                <Text type="secondary">
                  Leave blank to keep the saved URL ({editing.webhook_url_masked}).
                </Text>
              ) : null
            }
          >
            <Input.Password placeholder="https://hooks.slack.com/services/..." autoComplete="off" />
          </Form.Item>
          <Form.Item name="is_enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="sort_order" label="Sort order">
            <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Title level={5}>When to notify</Title>
          <Form.Item name="on_ticket_created" valuePropName="checked" initialValue>
            <Checkbox>Ticket created</Checkbox>
          </Form.Item>
          <Form.Item name="on_status_changed" valuePropName="checked">
            <Checkbox>Status changed</Checkbox>
          </Form.Item>
          <Form.Item name="on_client_reply" valuePropName="checked">
            <Checkbox>Client / portal reply (comment)</Checkbox>
          </Form.Item>
          <Title level={5}>Only if ticket matches (optional)</Title>
          <Form.Item name="team_ids" label="Teams">
            <Select mode="multiple" allowClear placeholder="Any team" options={teamOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="priority_ids" label="Priorities">
            <Select mode="multiple" allowClear placeholder="Any priority" options={priorityOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="company_ids" label="Companies">
            <Select mode="multiple" allowClear placeholder="Any company" options={companyOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="type_ids" label="Ticket types">
            <Select mode="multiple" allowClear placeholder="Any type" options={typeOpts} optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
