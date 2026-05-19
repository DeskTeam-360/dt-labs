'use client'

import { DeleteOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title } = Typography
const { TextArea } = Input

interface ProjectsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface ProjectRow {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

export default function ProjectsContent({ user: currentUser }: ProjectsContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch projects')
      setProjects(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to fetch projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const openCreate = () => {
    form.resetFields()
    setModalVisible(true)
  }

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      const res = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title?.trim(),
          description: values.description?.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create')
      message.success('Project created')
      setModalVisible(false)
      setProjects((prev) => [data as ProjectRow, ...prev])
      router.push(`/projects/${data.id}`)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Failed to create project')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      message.success('Project deleted')
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const columns: ColumnsType<ProjectRow> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Button type="link" onClick={() => router.push(`/projects/${record.id}`)} style={{ padding: 0 }}>
          {text}
        </Button>
      ),
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 200,
      render: (v: string) => <DateDisplay date={v} format="detailed" />,
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => router.push(`/projects/${record.id}`)} />
          <Popconfirm title="Delete this project?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
              <Title level={3} style={{ margin: 0 }}>
                Projects
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                New project
              </Button>
            </Space>

            <Card>
              <Spin spinning={loading}>
                <Table rowKey="id" columns={columns} dataSource={projects} pagination={{ pageSize: 20 }} />
              </Spin>
            </Card>
          </Space>

          <Modal
            title="New project"
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={submitCreate}
            okText="Create"
            destroyOnHidden
          >
            <Form form={form} layout="vertical">
              <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
                <Input placeholder="Project title" />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <TextArea rows={3} placeholder="Optional" />
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
