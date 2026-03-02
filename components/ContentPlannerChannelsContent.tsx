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
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { TextArea } = Input

interface ContentPlannerChannelsContentProps {
  user: User
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
  const supabase = createClient()

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('content_planner_channels')
        .select(`
          *,
          company_ai_system_template(id, title)
        `)
        .order('title', { ascending: true })

      if (error) throw error
      setChannels((data || []) as ChannelRecord[])
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Gagal memuat channels')
    } finally {
      setLoading(false)
    }
  }

  const fetchAiTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('company_ai_system_template')
        .select('id, title')
        .order('title')
      if (!error) setAiTemplates(data || [])
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
      const { error } = await supabase.from('content_planner_channels').delete().eq('id', id)
      if (error) throw error
      message.success('Channel dihapus')
      fetchChannels()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Gagal menghapus')
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
        const { error } = await supabase
          .from('content_planner_channels')
          .update(payload)
          .eq('id', editingChannel.id)
        if (error) throw error
        message.success('Channel diperbarui')
      } else {
        const { error } = await supabase.from('content_planner_channels').insert(payload)
        if (error) throw error
        message.success('Channel ditambah')
      }
      setModalVisible(false)
      form.resetFields()
      fetchChannels()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Gagal menyimpan')
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
            title="Hapus channel ini?"
            description="Content planner yang memakai channel ini akan kehilangan referensi channel."
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
                Content Planner Channels
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Tambah Channel
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
              title={editingChannel ? 'Edit Channel' : 'Tambah Channel'}
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
                  rules={[{ required: true, message: 'Wajib diisi' }]}
                >
                  <Input placeholder="e.g. Google Business Profile" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <TextArea rows={2} placeholder="Keterangan (opsional)" />
                </Form.Item>
                <Form.Item name="company_ai_system_template_id" label="Default AI Template">
                  <Select
                    placeholder="Pilih template (opsional)"
                    allowClear
                    options={aiTemplates.map((t) => ({ value: t.id, label: t.title }))}
                  />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={saving}>
                      {editingChannel ? 'Update' : 'Buat'}
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
