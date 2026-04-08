'use client'

import {
  Layout,
  Table,
  Button,
  Space,
  Typography,
  Card,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Tooltip,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect, type Key } from 'react'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import type { ColumnsType } from 'antd/es/table'

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
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [bulkAction, setBulkAction] = useState<'delete' | null>(null)

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
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/ticket-priorities/${id}`, { method: 'DELETE' })
      message.success('Priority deleted')
      setSelectedRowKeys((keys) => keys.filter((k) => Number(k) !== id))
      void fetchPriorities()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete priority')
    }
  }

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys.map((k) => Number(k)).filter((n) => !Number.isNaN(n))
    if (ids.length === 0) return
    setBulkAction('delete')
    try {
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/ticket-priorities/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Deleted ${ok} priorit${ok === 1 ? 'y' : 'ies'}`)
      if (failed > 0) message.error(`${failed} delete(s) failed`)
      setSelectedRowKeys([])
      void fetchPriorities()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk delete failed')
    } finally {
      setBulkAction(null)
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
      width: 112,
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 140,
      render: (title: string) => (
        <span style={{ display: 'block', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {title}
        </span>
      ),
      onCell: () => ({
        style: {
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          verticalAlign: 'top',
        },
      }),
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      width: 200,
      render: (slug: string) => (
        <Typography.Text code copyable style={{ wordBreak: 'break-all' }}>
          {slug}
        </Typography.Text>
      ),
      onCell: () => ({
        style: {
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          verticalAlign: 'top',
        },
      }),
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
      width: 100,
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button type="primary" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete this priority?"
            description="You cannot delete if tickets still use it."
            onConfirm={() => void handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Tooltip title="Delete">
              <Button type="primary" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <Title level={2} style={{ margin: 0 }}>
                Ticket priorities
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add priority
              </Button>
            </div>

            {selectedRowKeys.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: '#e6f4ff',
                  border: '1px solid #91caff',
                  borderRadius: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Typography.Text strong>{selectedRowKeys.length} selected</Typography.Text>
                <Space wrap>
                  <Popconfirm
                    title="Delete selected priorities?"
                    description="Deletes may fail if tickets still use a priority."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                    onConfirm={() => void handleBulkDelete()}
                    disabled={bulkAction !== null}
                  >
                    <span>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        loading={bulkAction === 'delete'}
                        disabled={bulkAction !== null && bulkAction !== 'delete'}
                      >
                        Bulk delete
                      </Button>
                    </span>
                  </Popconfirm>
                  <Button
                    type="link"
                    onClick={() => setSelectedRowKeys([])}
                    disabled={bulkAction !== null}
                  >
                    Clear selection
                  </Button>
                </Space>
              </div>
            )}

            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <Table<TicketPriorityRecord>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={priorities}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                tableLayout="fixed"
                style={{ width: '100%' }}
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '15', '20', '50'],
                  showTotal: (total) => `Total ${total} priorities`,
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>
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