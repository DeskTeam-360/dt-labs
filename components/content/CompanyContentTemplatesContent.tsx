'use client'

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import DateDisplay from '../DateDisplay'

const { Content } = Layout
const { Title, Text } = Typography

interface CompanyContentTemplatesContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface ContentTemplateRecord {
  id: string
  title: string
  content: string | null
  description: string | null
  type: string | null
  fields: string[] | null
  created_at: string
  updated_at: string
}

export default function CompanyContentTemplatesContent({
  user: currentUser,
}: CompanyContentTemplatesContentProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [templates, setTemplates] = useState<ContentTemplateRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewTitle, setPreviewTitle] = useState<string>('')

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/company-content-templates', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error || 'Failed to fetch')
      const json = await res.json()
      setTemplates(json?.data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch content templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleCreate = () => {
    router.push('/company-content-templates/create')
  }

  const handleEdit = (record: ContentTemplateRecord) => {
    router.push(`/company-content-templates/${record.id}/edit`)
  }

  const handlePreview = (record: ContentTemplateRecord) => {
    setPreviewTitle(record.title)
    setPreviewContent(record.content || 'No content available')
    setPreviewVisible(true)
  }

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/company-content-templates/${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error || 'Failed to delete')
      message.success('Content template deleted successfully')
      fetchTemplates()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete content template')
    }
  }

  const columns: ColumnsType<ContentTemplateRecord> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (description: string | null) => (
        <Text type="secondary" ellipsis>
          {description || 'No description'}
        </Text>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string | null) => (type ? <Text>{type}</Text> : '—'),
    },
    {
      title: 'Fields',
      dataIndex: 'fields',
      key: 'fields',
      render: (fields: string[] | null) =>
        fields?.length ? (
          <Space size={[4, 4]} wrap>
            {fields.map((f, i) => (
              <Tag key={i}>{f}</Tag>
            ))}
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: 'Content Preview',
      key: 'content_preview',
      render: (_, record) => (
        <Text ellipsis style={{ maxWidth: 200 }}>
          {record.content
            ? record.content.substring(0, 50) + '...'
            : 'No content'}
        </Text>
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
          <Tooltip title="Preview">
            <Button
              type="default"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
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

  // Avoid hydration mismatch: render same placeholder on server and initial client, then full UI after mount
  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--layout-bg)' }}>
        <Spin size="large" tip="Loading...">
          <div style={{ padding: 50, background: 'transparent' }} />
        </Spin>
      </div>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={currentUser}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
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
                <FileTextOutlined /> Content Templates Management
              </Title>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                Add Content Template
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
            title={previewTitle}
            open={previewVisible}
            onCancel={() => setPreviewVisible(false)}
            footer={[
              <Button key="close" onClick={() => setPreviewVisible(false)}>
                Close
              </Button>,
            ]}
            width={800}
          >
            <div
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '60vh',
                overflowY: 'auto',
              }}
            >
              {previewContent}
            </div>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

