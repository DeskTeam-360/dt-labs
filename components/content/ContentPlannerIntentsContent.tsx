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
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import AdminSidebar from '../AdminSidebar'
import AdminMainColumn from '../AdminMainColumn'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { TextArea } = Input

interface ContentPlannerIntentsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface IntentRecord {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

export default function ContentPlannerIntentsContent({ user: currentUser }: ContentPlannerIntentsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [intents, setIntents] = useState<IntentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingIntent, setEditingIntent] = useState<IntentRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchIntents = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/content-planner/intents', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setIntents((data || []) as IntentRecord[])
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to load intents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIntents()
  }, [])

  const handleCreate = () => {
    setEditingIntent(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: IntentRecord) => {
    setEditingIntent(record)
    form.setFieldsValue({
      title: record.title,
      description: record.description ?? '',
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/content-planner/intents/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
      message.success('Intent deleted')
      fetchIntents()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to delete')
    }
  }

  const handleSubmit = async (values: { title: string; description?: string }) => {
    setSaving(true)
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
      }
      if (editingIntent) {
        const res = await fetch(`/api/content-planner/intents/${editingIntent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
        message.success('Intent updated')
      } else {
        const res = await fetch('/api/content-planner/intents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
        message.success('Intent added')
      }
      setModalVisible(false)
      form.resetFields()
      fetchIntents()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<IntentRecord> = [
    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this intent?"
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
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: '24px' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ margin: 0 }}>
                Content Planner – Intents
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add intent
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={intents}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} item` }}
            />
            <Modal
              title={editingIntent ? 'Edit intent' : 'Add intent'}
              open={modalVisible}
              onCancel={() => { setModalVisible(false); form.resetFields() }}
              footer={null}
              destroyOnClose
            >
              <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="e.g. Educational" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <TextArea rows={2} placeholder="Keterangan (opsional)" />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={saving}>
                      {editingIntent ? 'Update' : 'Create'}
                    </Button>
                    <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                  </Space>
                </Form.Item>
              </Form>
            </Modal>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
