'use client'

import {
  Layout,
  Table,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Popconfirm,
  Tooltip,
  Select,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import DateDisplay from './DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input

interface CompanyDataTemplatesContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface DataTemplateRecord {
  id: string
  title: string
  group: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function CompanyDataTemplatesContent({
  user: currentUser,
}: CompanyDataTemplatesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])
  const [templates, setTemplates] = useState<DataTemplateRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] =
    useState<DataTemplateRecord | null>(null)
  const [form] = Form.useForm()

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/company-data-templates', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as any)?.error || 'Failed to fetch')
      const json = await res.json()
      setTemplates(json.data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch data templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleCreate = () => {
    setEditingTemplate(null)
    form.resetFields()
    form.setFieldsValue({
      is_active: true,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: DataTemplateRecord) => {
    setEditingTemplate(record)
    form.setFieldsValue({
      title: record.title,
      group: record.group || '',
      is_active: record.is_active,
    })
    setModalVisible(true)
  }

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/company-data-templates/${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as any)?.error || 'Failed to delete')

      message.success('Data template deleted successfully')
      fetchTemplates()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete data template')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingTemplate) {
        const res = await fetch(`/api/company-data-templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: values.title,
            group: values.group || null,
            is_active: values.is_active,
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as any)?.error || 'Failed to update')

        message.success('Data template updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTemplates()
      } else {
        const res = await fetch('/api/company-data-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: values.title,
            group: values.group || null,
            is_active: values.is_active,
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as any)?.error || 'Failed to create')

        message.success('Data template created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTemplates()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save data template')
    }
  }

  // Get unique groups for filter
  const uniqueGroups = Array.from(
    new Set(templates.map((t) => t.group).filter(Boolean))
  ) as string[]

  const columns: ColumnsType<DataTemplateRecord> = [
    {
      title: 'ID (Slug)',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <code style={{ fontSize: 12, padding: '2px 6px', background: '#f5f5f5', borderRadius: 3 }}>
          {id}
        </code>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Group',
      dataIndex: 'group',
      key: 'group',
      render: (group: string | null) => (
        <Tag color="blue">{group || 'No Group'}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'default'}>
          {is_active ? 'ACTIVE' : 'INACTIVE'}
        </Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => <DateDisplay date={date} />,
    },
    {
      title: 'Actions',
      key: 'actions',
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
            title="Delete Template"
            description="Are you sure you want to delete this template?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
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
                <DatabaseOutlined /> Data Templates Management
              </Title>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                Add Data Template
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
            title={
              editingTemplate ? 'Edit Data Template' : 'Create Data Template'
            }
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={600}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[
                  { required: true, message: 'Please enter template title!' },
                ]}
                extra="The ID will be automatically generated from the title (slug)"
              >
                <Input placeholder="Template Title" disabled={!!editingTemplate} />
              </Form.Item>

              <Form.Item
                name="group"
                label="Group"
                extra="Optional: Group templates together (e.g., 'Contact', 'Location', etc.)"
              >
                <Input placeholder="Group Name" />
              </Form.Item>

              <Form.Item
                name="is_active"
                label="Status"
                valuePropName="checked"
              >
                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
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

