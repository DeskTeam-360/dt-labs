'use client'

import {
  Layout,
  Table,
  Button,
  Space,
  Typography,
  Card,
  Modal,
  message,
  Popconfirm,
  Tooltip,
  Spin,
  Tag,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title, Text } = Typography

interface CompanyContentTemplatesContentProps {
  user: User
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
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('company_content_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setTemplates(data || [])
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
      const { error } = await supabase
        .from('company_content_templates')
        .delete()
        .eq('id', templateId)

      if (error) throw error

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
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

      <Layout
        style={{
          marginLeft: collapsed ? 80 : 250,
          transition: 'margin-left 0.2s',
        }}
      >
        <Content
          style={{
            padding: '24px',
            background: '#f0f2f5',
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
      </Layout>
    </Layout>
  )
}

