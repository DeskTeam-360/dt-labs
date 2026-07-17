'use client'

import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type Diagnostics = {
  ok: boolean
  current_user: string | null
  session_user?: string | null
  owner: string | null
  schema_usage_public: boolean
  select_job_types: boolean
  row_count: number | null
  rls_enabled: boolean | null
  messages: string[]
}

interface JobTypeRow {
  slug: string
  title: string
  sort_order: number
  is_active: boolean
  created_at: string | null
}

interface JobTypesCatalogAdminContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

async function fetchDiagnostics(): Promise<Diagnostics> {
  const res = await fetch('/api/settings/job-types-catalog', { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText)
  const d = (data as { diagnostics?: Diagnostics }).diagnostics
  if (!d) throw new Error('No diagnostics payload')
  return d
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64)
}

export default function JobTypesCatalogAdminContent({ user: currentUser }: JobTypesCatalogAdminContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [diagLoading, setDiagLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [rows, setRows] = useState<JobTypeRow[]>([])
  const [repairing, setRepairing] = useState(false)
  const [recreating, setRecreating] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<JobTypeRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const reloadDiagnostics = useCallback(async () => {
    setDiagLoading(true)
    try {
      const d = await fetchDiagnostics()
      setDiagnostics(d)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load diagnostics')
      setDiagnostics(null)
    } finally {
      setDiagLoading(false)
    }
  }, [])

  const fetchList = useCallback(async () => {
    setListLoading(true)
    try {
      const data = await apiFetch<JobTypeRow[]>('/api/settings/job-types')
      setRows(data || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load job types')
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadDiagnostics()
    fetchList()
  }, [reloadDiagnostics, fetchList])

  const runRepair = async () => {
    setRepairing(true)
    try {
      const res = await fetch('/api/settings/job-types-catalog', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair_permissions' }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.diagnostics) setDiagnostics(data.diagnostics as Diagnostics)
      if (!res.ok) {
        message.error((data as { error?: string }).error || 'Repair failed')
        return
      }
      message.success('PUBLIC grants refreshed for schema usage and SELECT on job_types.')
      void fetchList()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Repair failed')
    } finally {
      setRepairing(false)
    }
  }

  const runRecreate = () => {
    Modal.confirm({
      title: 'Recreate job_types table?',
      content:
        'This drops public.job_types (CASCADE), recreates seed rows, and re-attaches FK on ticket_time_tracker. Any extra rows or custom edits in job_types will be removed. Existing tracker rows pointing at unknown job_type slugs are set to "other". Continue?',
      okText: 'Recreate',
      okType: 'danger',
      onOk: async () => {
        setRecreating(true)
        try {
          const res = await fetch('/api/settings/job-types-catalog', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'recreate_catalog' }),
          })
          const data = await res.json().catch(() => ({}))
          if (data?.diagnostics) setDiagnostics(data.diagnostics as Diagnostics)
          if (!res.ok) {
            message.error((data as { error?: string }).error || 'Recreate failed')
            return
          }
          message.success('job_types recreated and FK restored.')
          void fetchList()
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Recreate failed')
        } finally {
          setRecreating(false)
        }
      },
    })
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      slug: '',
      title: '',
      sort_order:
        rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order), 0) + 10 : 10,
      is_active: true,
    })
    setModalOpen(true)
  }

  const openEdit = (record: JobTypeRow) => {
    setEditing(record)
    form.setFieldsValue({
      slug: record.slug,
      title: record.title,
      sort_order: record.sort_order,
      is_active: record.is_active,
    })
    setModalOpen(true)
  }

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editing && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await apiFetch(`/api/settings/job-types/${encodeURIComponent(editing.slug)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: values.title,
            sort_order: values.sort_order,
            is_active: values.is_active,
          }),
        })
        message.success('Job type updated')
      } else {
        await apiFetch('/api/settings/job-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: values.slug,
            title: values.title,
            sort_order: values.sort_order,
            is_active: values.is_active,
          }),
        })
        message.success('Job type created')
      }
      setModalOpen(false)
      fetchList()
      reloadDiagnostics()
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return
      message.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: JobTypeRow) => {
    try {
      await apiFetch(`/api/settings/job-types/${encodeURIComponent(record.slug)}`, { method: 'DELETE' })
      message.success(`Deleted "${record.slug}"; time tracker rows were moved to "other".`)
      fetchList()
      reloadDiagnostics()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const columns: ColumnsType<JobTypeRow> = [
    { title: 'Slug', dataIndex: 'slug', width: 160, render: (s: string) => <Text code>{s}</Text> },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    { title: 'Sort', dataIndex: 'sort_order', width: 80 },
    {
      title: 'Active',
      dataIndex: 'is_active',
      width: 100,
      render: (a: boolean) => (a ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>
          {record.slug === 'other' ? (
            <Button type="link" size="small" disabled>
              Delete
            </Button>
          ) : (
            <Popconfirm
              title={`Delete "${record.slug}"?`}
              description='Time tracked with this category will switch to "other".'
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{
          ...currentUser,
          role: currentUser.role ?? undefined,
        }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, maxWidth: 1100 }}>
          <Link href="/settings" style={{ display: 'inline-block', marginBottom: 16, color: 'inherit' }}>
            <Space style={{ opacity: 0.85 }}>
              <ArrowLeftOutlined />
              Back to Settings
            </Space>
          </Link>

          <Title level={2}>Job types</Title>
       
          <Card title="Job types" style={{ marginBottom: 24 }}>
            <Space style={{ marginBottom: 16 }} wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add job type
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => fetchList()} loading={listLoading}>
                Refresh list
              </Button>
            </Space>

            <Table<JobTypeRow>
              rowKey="slug"
              loading={listLoading}
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              size="small"
            />

            <Modal
              title={editing ? `Edit "${editing.slug}"` : 'Add job type'}
              open={modalOpen}
              onCancel={() => setModalOpen(false)}
              destroyOnHidden
              onOk={() => handleSubmit()}
              confirmLoading={saving}
              okText="Save"
            >
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                  label="Slug"
                  name="slug"
                  rules={[{ required: !editing, message: 'Slug is required' }]}
                  extra="Lowercase letters, numbers, underscores only (max 64). Cannot change after creation."
                >
                  <Input disabled={!!editing} placeholder="e.g. design_review" />
                </Form.Item>
                <Form.Item
                  label="Title"
                  name="title"
                  rules={[{ required: true, message: 'Title is required' }]}
                >
                  <Input placeholder="Display name" onChange={onTitleChange} />
                </Form.Item>
                <Form.Item label="Sort order" name="sort_order" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label="Active" name="is_active" valuePropName="checked">
                  <Switch disabled={editing?.slug === 'other'} checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>
                {editing?.slug === 'other' ? (
                  <Text type="secondary" style={{ display: 'block' }}>
                    The &quot;other&quot; slug must remain active as a fallback and cannot be deleted.
                  </Text>
                ) : null}
              </Form>
            </Modal>
          </Card>

       
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
