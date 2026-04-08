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
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import DateDisplay from './DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input

interface CompanyAISystemTemplatesContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface AISystemTemplateRecord {
  id: string
  title: string
  content: string
  format: string | null
  created_at: string
  updated_at: string
}

export default function CompanyAISystemTemplatesContent({
  user: currentUser,
}: CompanyAISystemTemplatesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [templates, setTemplates] = useState<AISystemTemplateRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] =
    useState<AISystemTemplateRecord | null>(null)
  const [form] = Form.useForm()

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/company-ai-system-templates', { credentials: 'include' })
      if (!res.ok) throw new Error(await res.json().then((r: any) => r.error || 'Failed to fetch'))
      const data = await res.json()
      setTemplates(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch AI system templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleCreate = () => {
    setEditingTemplate(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: AISystemTemplateRecord) => {
    setEditingTemplate(record)
    form.setFieldsValue({
      title: record.title,
      content: record.content ?? '',
      format: record.format ?? '',
    })
    setModalVisible(true)
  }

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/company-ai-system-templates/${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await res.json().then((r: any) => r.error || 'Failed to delete'))
      message.success('AI system template deleted')
      fetchTemplates()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete template')
    }
  }

  const handleSubmit = async (values: { title: string; content: string; format?: string }) => {
    try {
      if (editingTemplate) {
        const res = await fetch(`/api/company-ai-system-templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: values.title,
            content: values.content ?? '',
            format: values.format?.trim() || null,
          }),
        })
        if (!res.ok) throw new Error(await res.json().then((r: any) => r.error || 'Failed to update'))
        message.success('AI system template updated')
      } else {
        const res = await fetch('/api/company-ai-system-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: values.title,
            content: values.content ?? '',
            format: values.format?.trim() || null,
          }),
        })
        if (!res.ok) throw new Error(await res.json().then((r: any) => r.error || 'Failed to create'))
        message.success('AI system template created')
      }
      setModalVisible(false)
      form.resetFields()
      fetchTemplates()
    } catch (error: any) {
      message.error(error.message || 'Failed to save template')
    }
  }

  const columns: ColumnsType<AISystemTemplateRecord> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Content',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (content: string) => (
        <Text ellipsis style={{ maxWidth: 280 }}>
          {content ? (content.slice(0, 80) + (content.length > 80 ? '...' : '')) : '—'}
        </Text>
      ),
    },
    {
      title: 'Format',
      dataIndex: 'format',
      key: 'format',
      ellipsis: true,
      render: (format: string | null) =>
        format ? (
          <Text ellipsis style={{ maxWidth: 200 }}>
            {format.replace(/\n/g, ' ').slice(0, 80)}
            {format.length > 80 ? '...' : ''}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 140,
      render: (date: string) => <DateDisplay date={date} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete template"
            description="Are you sure you want to delete this template?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="primary" danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={currentUser}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn
        collapsed={collapsed}
        user={currentUser}
        style={{ marginLeft: mounted ? (collapsed ? 80 : 250) : 250 }}
        layoutProps={{ suppressHydrationWarning: true }}
      >
        <Content
          style={{
            padding: '24px',
            background: 'var(--layout-bg)',
            minHeight: '100vh',
          }}
        >
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <Title level={2} style={{ margin: 0 }}>
                <RobotOutlined /> AI System Templates
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add AI System Template
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={templates}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} templates`,
              }}
            />
          </Card>

          <Modal
            title={editingTemplate ? 'Edit AI System Template' : 'Create AI System Template'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={640}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter title' }]}
              >
                <Input placeholder="Template title" />
              </Form.Item>
              <Form.Item
                name="format"
                label="Format"
                extra="Optional: e.g. json, text, markdown (multi-line supported)"
              >
                <TextArea rows={3} placeholder="Format" />
              </Form.Item>
              <Form.Item
                name="content"
                label="Content"
                rules={[{ required: true, message: 'Please enter content' }]}
              >
                <TextArea rows={8} placeholder="Template content (system prompt, instructions, etc.)" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingTemplate ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
