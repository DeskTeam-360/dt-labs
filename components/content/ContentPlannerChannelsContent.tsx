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
  Select,
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

interface ContentPlannerChannelsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface ChannelRecord {
  id: string
  title: string
  description: string | null
  company_ai_system_template_id: string | null
  created_at: string
  updated_at: string
  company_ai_system_template?: { id: string; title: string } | null
}

export default function ContentPlannerChannelsContent({ user: currentUser }: ContentPlannerChannelsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [channels, setChannels] = useState<ChannelRecord[]>([])
  const [aiTemplates, setAiTemplates] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingChannel, setEditingChannel] = useState<ChannelRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/content-planner/channels', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setChannels(data || [])
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to load channels')
    } finally {
      setLoading(false)
    }
  }

  const fetchAiTemplates = async () => {
    try {
      const res = await fetch('/api/content-planner/lookup', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setAiTemplates(data.aiTemplates || [])
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchChannels()
    fetchAiTemplates()
  }, [])

  const handleCreate = () => {
    setEditingChannel(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: ChannelRecord) => {
    setEditingChannel(record)
    form.setFieldsValue({
      title: record.title,
      description: record.description ?? '',
      company_ai_system_template_id: record.company_ai_system_template_id ?? undefined,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/content-planner/channels/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
      message.success('Channel deleted')
      fetchChannels()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to delete')
    }
  }

  const handleSubmit = async (values: { title: string; description?: string; company_ai_system_template_id?: string }) => {
    setSaving(true)
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        company_ai_system_template_id: values.company_ai_system_template_id || null,
      }

      if (editingChannel) {
        const res = await fetch(`/api/content-planner/channels/${editingChannel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
        message.success('Channel updated')
      } else {
        const res = await fetch('/api/content-planner/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
        message.success('Channel added')
      }
      setModalVisible(false)
      form.resetFields()
      fetchChannels()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<ChannelRecord> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Default AI Template',
      key: 'company_ai_system_template',
      width: 200,
      render: (_, r) => r.company_ai_system_template?.title ?? '—',
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
            title="Delete this channel?"
            description="Content planners that use this channel will lose their channel reference."
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
                Content Planner Channels
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add channel
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={channels}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} item` }}
            />

            <Modal
              title={editingChannel ? 'Edit channel' : 'Add channel'}
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
                  <Input placeholder="e.g. Google Business Profile" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <TextArea rows={2} placeholder="Description (optional)" />
                </Form.Item>
                <Form.Item name="company_ai_system_template_id" label="Default AI Template">
                  <Select
                    placeholder="Select template (optional)"
                    allowClear
                    options={aiTemplates.map((t) => ({ value: t.id, label: t.title }))}
                  />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={saving}>
                      {editingChannel ? 'Update' : 'Create'}
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
