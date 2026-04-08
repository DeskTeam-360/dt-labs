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
  Switch,
  message,
  Popconfirm,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useState, useEffect, type Key } from 'react'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography

interface TicketStatusesContentProps {
  user: { id: string; email?: string | null; name?: string | null; user_metadata?: { full_name?: string | null } }
}

interface TicketStatusRecord {
  id: number
  slug: string
  title: string
  customer_title?: string
  description?: string
  color: string
  show_in_kanban: boolean
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
  const hex = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#1890ff'
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
        placeholder="#1890ff"
        style={{ width: 120 }}
        {...rest}
      />
    </Space>
  )
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function TicketStatusesContent({ user: currentUser }: TicketStatusesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [statuses, setStatuses] = useState<TicketStatusRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingStatus, setEditingStatus] = useState<TicketStatusRecord | null>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [bulkAction, setBulkAction] = useState<
    'delete' | 'kanban_show' | 'kanban_hide' | null
  >(null)

  const fetchStatuses = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<TicketStatusRecord[]>('/api/ticket-statuses')
      setStatuses(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch statuses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatuses()
  }, [])

  const handleCreate = () => {
    setEditingStatus(null)
    form.resetFields()
    form.setFieldsValue({
      show_in_kanban: true,
      sort_order: (statuses.length > 0 ? Math.max(...statuses.map((s) => s.sort_order)) : 0) + 1,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TicketStatusRecord) => {
    setEditingStatus(record)
    form.setFieldsValue({
      title: record.title,
      slug: record.slug,
      customer_title: record.customer_title ?? '',
      description: record.description ?? '',
      color: record.color,
      show_in_kanban: record.show_in_kanban,
      sort_order: record.sort_order,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/ticket-statuses/${id}`, { method: 'DELETE' })
      message.success('Status deleted')
      setSelectedRowKeys((keys) => keys.filter((k) => Number(k) !== id))
      fetchStatuses()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete status')
    }
  }

  const handleBulkKanban = async (show_in_kanban: boolean) => {
    const ids = selectedRowKeys.map((k) => Number(k)).filter((n) => !Number.isNaN(n))
    if (ids.length === 0) return
    setBulkAction(show_in_kanban ? 'kanban_show' : 'kanban_hide')
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch(`/api/ticket-statuses/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ show_in_kanban }),
          })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      const label = show_in_kanban ? 'shown in Kanban' : 'hidden from Kanban'
      if (ok > 0) message.success(`Updated ${ok} status(es) — ${label}`)
      if (failed > 0) message.error(`${failed} update(s) failed`)
      setSelectedRowKeys([])
      fetchStatuses()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk update failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys.map((k) => Number(k)).filter((n) => !Number.isNaN(n))
    if (ids.length === 0) return
    setBulkAction('delete')
    try {
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/ticket-statuses/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Deleted ${ok} status(es)`)
      if (failed > 0) message.error(`${failed} delete(s) failed`)
      setSelectedRowKeys([])
      fetchStatuses()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk delete failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editingStatus && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        title: String(values.title || '').trim(),
        slug: String(values.slug || '').trim().toLowerCase().replace(/\s+/g, '_'),
        customer_title: (values.customer_title as string)?.trim() || null,
        description: (values.description as string)?.trim() ?? '',
        color: (values.color as string) || '#8c8c8c',
        show_in_kanban: editingStatus
          ? Boolean(values.show_in_kanban)
          : !!(values.show_in_kanban ?? true),
        sort_order: Number(values.sort_order) ?? 0,
      }

      if (editingStatus) {
        await apiFetch(`/api/ticket-statuses/${editingStatus.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Status updated')
      } else {
        await apiFetch('/api/ticket-statuses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Status created')
      }

      setModalVisible(false)
      form.resetFields()
      fetchStatuses()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save status')
    }
  }

  const columns: ColumnsType<TicketStatusRecord> = [
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
      title: 'Customer Title',
      dataIndex: 'customer_title',
      key: 'customer_title',
      render: (v: string) => v || '—',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 280,
      render: (v: string) => (
        <span style={{ display: 'block', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {v || '—'}
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
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 150,
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
      title: 'Show in Kanban',
      dataIndex: 'show_in_kanban',
      key: 'show_in_kanban',
      width: 120,
      render: (v: boolean) => (v ? 'Yes' : 'No'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button type="primary" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete this status?"
            description="Tickets using this status will keep the value; consider reassigning them first."
            onConfirm={() => handleDelete(record.id)}
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
                Ticket Statuses
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add Status
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
                  <Button
                    icon={<CheckCircleOutlined />}
                    loading={bulkAction === 'kanban_show'}
                    disabled={bulkAction !== null && bulkAction !== 'kanban_show'}
                    onClick={() => handleBulkKanban(true)}
                  >
                    Show in Kanban
                  </Button>
                  <Button
                    icon={<StopOutlined />}
                    loading={bulkAction === 'kanban_hide'}
                    disabled={bulkAction !== null && bulkAction !== 'kanban_hide'}
                    onClick={() => handleBulkKanban(false)}
                  >
                    Hide from Kanban
                  </Button>
                  <Popconfirm
                    title="Delete selected statuses?"
                    description="Tickets using these statuses will keep their values; consider reassigning them first."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                    onConfirm={handleBulkDelete}
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
              <Table<TicketStatusRecord>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={statuses}
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
                  showTotal: (total) => `Total ${total} statuses`,
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>
          </Card>

          <Modal
            title={editingStatus ? 'Edit Status' : 'Add Status'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. In Progress" onChange={handleTitleChange} />
              </Form.Item>
              <Form.Item name="customer_title" label="Customer Title">
                <Input placeholder="e.g. In Progress (shown to customer)" />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Description of this status" />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique, used in DB)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. in_progress" disabled={!!editingStatus} />
              </Form.Item>
              <Form.Item name="color" label="Color (hex)" initialValue="#1890ff">
                <ColorPickerWithInput />
              </Form.Item>
              <Form.Item name="show_in_kanban" label="Show in Kanban" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sort_order" label="Sort order" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingStatus ? 'Update' : 'Create'}
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
