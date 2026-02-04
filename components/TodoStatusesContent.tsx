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
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography

interface TodoStatusesContentProps {
  user: User
}

interface TodoStatusRecord {
  id: number
  slug: string
  title: string
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

export default function TodoStatusesContent({ user: currentUser }: TodoStatusesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [statuses, setStatuses] = useState<TodoStatusRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingStatus, setEditingStatus] = useState<TodoStatusRecord | null>(null)
  const [form] = Form.useForm()
  const supabase = createClient()

  const fetchStatuses = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('todo_statuses')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setStatuses((data || []) as TodoStatusRecord[])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch statuses')
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

  const handleEdit = (record: TodoStatusRecord) => {
    setEditingStatus(record)
    form.setFieldsValue({
      title: record.title,
      slug: record.slug,
      color: record.color,
      show_in_kanban: record.show_in_kanban,
      sort_order: record.sort_order,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase.from('todo_statuses').delete().eq('id', id)

      if (error) throw error
      message.success('Status deleted')
      fetchStatuses()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete status')
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editingStatus && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        title: values.title.trim(),
        slug: values.slug.trim().toLowerCase().replace(/\s+/g, '_'),
        color: values.color || '#8c8c8c',
        show_in_kanban: !!values.show_in_kanban,
        sort_order: Number(values.sort_order) ?? 0,
      }

      if (editingStatus) {
        const { error } = await supabase
          .from('todo_statuses')
          .update(payload)
          .eq('id', editingStatus.id)

        if (error) throw error
        message.success('Status updated')
      } else {
        const { error } = await supabase.from('todo_statuses').insert(payload)

        if (error) throw error
        message.success('Status created')
      }

      setModalVisible(false)
      form.resetFields()
      fetchStatuses()
    } catch (error: any) {
      message.error(error.message || 'Failed to save status')
    }
  }

  const columns: ColumnsType<TodoStatusRecord> = [
    {
      title: 'Order',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
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
      title: 'Show in Kanban',
      dataIndex: 'show_in_kanban',
      key: 'show_in_kanban',
      width: 120,
      render: (v: boolean) => (v ? 'Yes' : 'No'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this status?"
            description="Tickets using this status will keep the value; consider reassigning them first."
            onConfirm={() => handleDelete(record.id)}
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
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ margin: '24px' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ margin: 0 }}>
                Todo Statuses
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add Status
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={statuses}
              pagination={false}
            />
          </Card>

          <Modal
            title={editingStatus ? 'Edit Status' : 'Add Status'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            destroyOnClose
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. In Progress" onChange={handleTitleChange} />
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
      </Layout>
    </Layout>
  )
}
