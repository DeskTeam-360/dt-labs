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
import AdminSidebar from './AdminSidebar'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { TextArea } = Input

interface ContentPlannerTopicTypesContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface TopicTypeRecord {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

export default function ContentPlannerTopicTypesContent({ user: currentUser }: ContentPlannerTopicTypesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [topicTypes, setTopicTypes] = useState<TopicTypeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTopicType, setEditingTopicType] = useState<TopicTypeRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchTopicTypes = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/content-planner/topic-types', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal memuat topic types')
      setTopicTypes((Array.isArray(json) ? json : json.data || []) as TopicTypeRecord[])
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Gagal memuat topic types')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTopicTypes()
  }, [])

  const handleCreate = () => {
    setEditingTopicType(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: TopicTypeRecord) => {
    setEditingTopicType(record)
    form.setFieldsValue({
      title: record.title,
      description: record.description ?? '',
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/content-planner/topic-types/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
      message.success('Topic type dihapus')
      fetchTopicTypes()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Gagal menghapus')
    }
  }

  const handleSubmit = async (values: { title: string; description?: string }) => {
    setSaving(true)
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
      }
      if (editingTopicType) {
        const res = await fetch(`/api/content-planner/topic-types/${editingTopicType.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
        message.success('Topic type diperbarui')
      } else {
        const res = await fetch('/api/content-planner/topic-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed')
        message.success('Topic type ditambah')
      }
      setModalVisible(false)
      form.resetFields()
      fetchTopicTypes()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<TopicTypeRecord> = [
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
            title="Hapus topic type ini?"
            onConfirm={() => handleDelete(record.id)}
            okText="Hapus"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Hapus
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
                Content Planner – Topic Types
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Tambah Topic Type
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={topicTypes}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} item` }}
            />
            <Modal
              title={editingTopicType ? 'Edit Topic Type' : 'Tambah Topic Type'}
              open={modalVisible}
              onCancel={() => { setModalVisible(false); form.resetFields() }}
              footer={null}
              destroyOnClose
            >
              <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Wajib diisi' }]}>
                  <Input placeholder="e.g. How-to" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <TextArea rows={2} placeholder="Keterangan (opsional)" />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={saving}>
                      {editingTopicType ? 'Update' : 'Buat'}
                    </Button>
                    <Button onClick={() => setModalVisible(false)}>Batal</Button>
                  </Space>
                </Form.Item>
              </Form>
            </Modal>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}
