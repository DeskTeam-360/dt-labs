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

interface TagsContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null } }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

interface TagRecord {
  id: string
  name: string
  slug: string
  color: string
  created_at: string
  updated_at: string
}

function slugFromName(name: string): string {
  return name
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

export default function TagsContent({ user: currentUser }: TagsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tags, setTags] = useState<TagRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTag, setEditingTag] = useState<TagRecord | null>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [bulkAction, setBulkAction] = useState<'delete' | null>(null)

  const fetchTags = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<TagRecord[]>('/api/tags')
      setTags(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch tags')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTags()
  }, [])

  const handleCreate = () => {
    setEditingTag(null)
    form.resetFields()
    form.setFieldsValue({ color: '#000000' })
    setModalVisible(true)
  }

  const handleEdit = (record: TagRecord) => {
    setEditingTag(record)
    form.setFieldsValue({
      name: record.name,
      slug: record.slug,
      color: record.color || '#000000',
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/tags/${id}`, { method: 'DELETE' })
      message.success('Tag deleted')
      setSelectedRowKeys((keys) => keys.filter((k) => String(k) !== id))
      fetchTags()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete tag')
    }
  }

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys.map(String).filter(Boolean)
    if (ids.length === 0) return
    setBulkAction('delete')
    try {
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/tags/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Deleted ${ok} tag(s)`)
      if (failed > 0) message.error(`${failed} delete(s) failed`)
      setSelectedRowKeys([])
      fetchTags()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk delete failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    if (!editingTag && name) {
      form.setFieldValue('slug', slugFromName(name))
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        name: String(values.name || '').trim(),
        slug: String(values.slug || '').trim().toLowerCase().replace(/\s+/g, '_'),
        color: (values.color as string) || '#000000',
      }

      if (editingTag) {
        await apiFetch(`/api/tags/${editingTag.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Tag updated')
      } else {
        await apiFetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Tag created')
      }
      setModalVisible(false)
      form.resetFields()
      fetchTags()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save tag')
    }
  }

  const columns: ColumnsType<TagRecord> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name: string) => (
        <span style={{ display: 'block', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {name}
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
              backgroundColor: color || '#000000',
              border: '1px solid #d9d9d9',
            }}
          />
          <Typography.Text type="secondary">{color || '#000000'}</Typography.Text>
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
            title="Delete this tag?"
            description="It will be removed from all tickets."
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
                Tags
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add Tag
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
                    title="Delete selected tags?"
                    description="They will be removed from all tickets."
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
              <Table<TagRecord>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={tags}
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
                  showTotal: (total) => `Total ${total} tags`,
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>
          </Card>

          <Modal
            title={editingTag ? 'Edit Tag' : 'Add Tag'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. urgent" onChange={handleNameChange} />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. urgent" disabled={!!editingTag} />
              </Form.Item>
              <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                <ColorPickerWithInput />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingTag ? 'Update' : 'Create'}
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
