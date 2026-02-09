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
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography

interface TicketTypesContentProps {
  user: User
}

interface TicketTypeRecord {
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

export default function TicketTypesContent({ user: currentUser }: TicketTypesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [types, setTypes] = useState<TicketTypeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingType, setEditingType] = useState<TicketTypeRecord | null>(null)
  const [form] = Form.useForm()
  const supabase = createClient()

  const fetchTypes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('ticket_types')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setTypes((data || []) as TicketTypeRecord[])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch ticket types')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTypes()
  }, [])

  const handleCreate = () => {
    setEditingType(null)
    form.resetFields()
    form.setFieldsValue({
      color: '#000000',
      sort_order: types.length > 0 ? Math.max(...types.map((t) => t.sort_order)) + 1 : 0,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TicketTypeRecord) => {
    setEditingType(record)
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
      const { error } = await supabase.from('ticket_types').delete().eq('id', id)
      if (error) throw error
      message.success('Type deleted')
      fetchTypes()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete type')
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editingType && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        title: values.title.trim(),
        slug: values.slug.trim().toLowerCase().replace(/\s+/g, '_'),
        color: values.color || '#000000',
        sort_order: Number(values.sort_order) ?? 0,
      }

      if (editingType) {
        const { error } = await supabase
          .from('ticket_types')
          .update(payload)
          .eq('id', editingType.id)
        if (error) throw error
        message.success('Type updated')
      } else {
        const { error } = await supabase.from('ticket_types').insert(payload)
        if (error) throw error
        message.success('Type created')
      }
      setModalVisible(false)
      form.resetFields()
      fetchTypes()
    } catch (error: any) {
      message.error(error.message || 'Failed to save type')
    }
  }

  const columns: ColumnsType<TicketTypeRecord> = [
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
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this type?"
            description="Tickets using this type will have type cleared."
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
                Ticket Types
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add Type
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={types}
              pagination={false}
            />
          </Card>

          <Modal
            title={editingType ? 'Edit Type' : 'Add Type'}
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
                <Input placeholder="e.g. Bug" onChange={handleTitleChange} />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. bug" disabled={!!editingType} />
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
                    {editingType ? 'Update' : 'Create'}
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
