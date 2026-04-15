'use client'

import { DeleteOutlined,EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect,useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'

const { Content } = Layout
const { Title } = Typography

interface TicketPrioritiesContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null }; role?: string }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

interface TicketPriorityRecord {
  id: number
  slug: string
  title: string
  description?: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function ColorPickerWithInput({
  value,
  onChange,
  ...rest
}: {
  value?: string
  onChange?: (v: string) => void
} & React.ComponentProps<typeof Input>) {
  const hex = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'
  return (
    <Space align="center" style={{ width: '100%' }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: 40,
          height: 32,
          padding: 2,
          cursor: 'pointer',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
        }}
      />
      <Input
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#000000"
        style={{ width: 120 }}
        {...rest}
      />
    </Space>
  )
}

export default function TicketPrioritiesContent({ user: currentUser }: TicketPrioritiesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [priorities, setPriorities] = useState<TicketPriorityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<TicketPriorityRecord | null>(null)
  const [form] = Form.useForm()

  const fetchPriorities = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<TicketPriorityRecord[]>('/api/ticket-priorities')
      setPriorities(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch priorities')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchPriorities()
  }, [])

  const handleCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      color: '#ff4d4f',
      sort_order: priorities.length > 0 ? Math.max(...priorities.map((p) => p.sort_order)) + 1 : 0,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TicketPriorityRecord) => {
    setEditing(record)
    form.setFieldsValue({
      title: record.title,
      slug: record.slug,
      color: record.color,
      sort_order: record.sort_order,
      description: record.description ?? '',
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/ticket-priorities/${id}`, { method: 'DELETE' })
      message.success('Priority deleted')
      void fetchPriorities()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete priority')
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editing && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        title: String(values.title || '').trim(),
        slug: String(values.slug || '').trim().toLowerCase().replace(/\s+/g, '_'),
        color: (values.color as string) || '#000000',
        sort_order: Number(values.sort_order) ?? 0,
        description: typeof values.description === 'string' ? values.description : '',
      }

      if (editing) {
        await apiFetch(`/api/ticket-priorities/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Priority updated')
      } else {
        await apiFetch('/api/ticket-priorities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Priority created')
      }
      setModalVisible(false)
      form.resetFields()
      void fetchPriorities()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save priority')
    }
  }

  const columns: ColumnsType<TicketPriorityRecord> = [
    {
      title: 'Order',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 100,
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (slug: string) => (
        <Typography.Text code copyable>
          {slug}
        </Typography.Text>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (d: string | undefined) => (
        <Typography.Text type="secondary" ellipsis>
          {(d ?? '').trim() || '—'}
        </Typography.Text>
      ),
    },
    {
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 120,
      render: (color: string) => (
        <Space>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: color,
              border: '1px solid #d9d9d9',
            }}
          />
          <Typography.Text type="secondary">{color}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this priority?"
            description="You cannot delete if tickets still use it."
            onConfirm={() => void handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
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
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: '24px' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ margin: 0 }}>
                Ticket priorities
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add priority
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={priorities}
              pagination={false}
            />
          </Card>

          <Modal
            title={editing ? 'Edit priority' : 'New priority'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
          >
            <Form form={form} layout="vertical" onFinish={(v) => void handleSubmit(v)}>
              <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="e.g. Critical" onChange={handleTitleChange} />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. critical" disabled={!!editing} />
              </Form.Item>
              <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                <ColorPickerWithInput />
              </Form.Item>
              <Form.Item name="sort_order" label="Sort order" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="description" label="Reference description">
                <Input.TextArea
                  rows={3}
                  placeholder="Shown on Reference page (priorities tab) for all users who can open tickets"
                />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editing ? 'Update' : 'Create'}
                  </Button>
                  <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}