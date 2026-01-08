'use client'

import { Layout, Table, Button, Space, Typography, Card, Tag, Modal, Form, Input, Select, InputNumber, message, Popconfirm } from 'antd'
import { PlusOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import { startCrawl } from '@/app/actions/crawl'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { Option } = Select
const { TextArea } = Input

interface CrawlSessionsContentProps {
  user: User
}

interface CrawlSessionRecord {
  id: string
  company_website_id: string
  status: string
  total_pages: number
  crawled_pages: number
  failed_pages: number
  error_message: string | null
  max_depth: number
  max_pages: number
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  company_websites?: {
    id: string
    company_id: string
    url: string
    title: string | null
    companies?: {
      id: string
      name: string
    }
  }
}

interface CompanyWebsiteRecord {
  id: string
  company_id: string
  url: string
  title: string | null
  description: string | null
  is_primary: boolean
  companies?: {
    id: string
    name: string
  }
}

export default function CrawlSessionsContent({ user: currentUser }: CrawlSessionsContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [crawlSessions, setCrawlSessions] = useState<CrawlSessionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [companies, setCompanies] = useState<any[]>([])
  const [companyWebsites, setCompanyWebsites] = useState<CompanyWebsiteRecord[]>([])
  const [loadingWebsites, setLoadingWebsites] = useState(false)
  const supabase = createClient()

  const fetchCrawlSessions = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('crawl_sessions')
        .select(`
          *,
          company_websites (
            id,
            company_id,
            url,
            title,
            companies (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      setCrawlSessions(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch crawl sessions')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error

      setCompanies(data || [])
    } catch (error: any) {
      console.error('Error fetching companies:', error)
    }
  }

  const fetchCompanyWebsites = async (companyId: string) => {
    if (!companyId) {
      setCompanyWebsites([])
      return
    }

    setLoadingWebsites(true)
    try {
      const { data, error } = await supabase
        .from('company_websites')
        .select(`
          *,
          companies (
            id,
            name
          )
        `)
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      setCompanyWebsites(data || [])
    } catch (error: any) {
      message.error('Failed to fetch company websites')
      console.error('Error fetching company websites:', error)
    } finally {
      setLoadingWebsites(false)
    }
  }

  useEffect(() => {
    fetchCrawlSessions()
    fetchCompanies()
  }, [])

  const handleCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      max_depth: 3,
      max_pages: 100,
    })
    setModalVisible(true)
  }

  const handleCompanyChange = (companyId: string) => {
    fetchCompanyWebsites(companyId)
    form.setFieldsValue({ company_website_id: undefined })
  }

  const handleSubmit = async (values: any) => {
    try {
      const result = await startCrawl({
        company_website_id: values.company_website_id,
        max_depth: values.max_depth || 3,
        max_pages: values.max_pages || 100,
      })

      if (result.error) {
        message.error(result.error)
      } else {
        message.success('Crawl session started successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCrawlSessions()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to start crawl')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('crawl_sessions')
        .delete()
        .eq('id', id)

      if (error) throw error

      message.success('Crawl session deleted successfully')
      fetchCrawlSessions()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete crawl session')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'crawling':
        return 'blue'
      case 'failed':
        return 'red'
      case 'pending':
        return 'orange'
      default:
        return 'default'
    }
  }

  const columns: ColumnsType<CrawlSessionRecord> = [
    {
      title: 'Company',
      key: 'company',
      render: (_, record) => record.company_websites?.companies?.name || 'N/A',
    },
    {
      title: 'Website URL',
      key: 'url',
      render: (_, record) => (
        <a href={record.company_websites?.url} target="_blank" rel="noopener noreferrer">
          {record.company_websites?.url}
        </a>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)} style={{ textTransform: 'uppercase' }}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_, record) => (
        <Space>
          <span>Crawled: {record.crawled_pages || 0}</span>
          <span>/</span>
          <span>Total: {record.total_pages || 0}</span>
          {record.failed_pages > 0 && (
            <Tag color="red">Failed: {record.failed_pages}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Settings',
      key: 'settings',
      render: (_, record) => (
        <Space>
          <span>Max Depth: {record.max_depth}</span>
          <span>|</span>
          <span>Max Pages: {record.max_pages}</span>
        </Space>
      ),
    },
    {
      title: 'Started At',
      key: 'started_at',
      render: (_, record) => record.started_at ? <DateDisplay date={record.started_at} /> : '-',
    },
    {
      title: 'Completed At',
      key: 'completed_at',
      render: (_, record) => record.completed_at ? <DateDisplay date={record.completed_at} /> : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/crawl-sessions/${record.id}`)}
          >
            View
          </Button>
          <Popconfirm
            title="Delete crawl session"
            description="Are you sure you want to delete this crawl session?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
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
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>Crawl Sessions</Title>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                Start New Crawl
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={crawlSessions}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} crawl sessions`,
              }}
            />
          </Card>

          <Modal
            title="Start New Crawl Session"
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={600}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
            >
              <Form.Item
                label="Company"
                name="company_id"
                rules={[{ required: true, message: 'Please select a company' }]}
              >
                <Select
                  placeholder="Select a company"
                  onChange={handleCompanyChange}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {companies.map((company) => (
                    <Option key={company.id} value={company.id} label={company.name}>
                      {company.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Company Website"
                name="company_website_id"
                rules={[{ required: true, message: 'Please select a website' }]}
              >
                <Select
                  placeholder="Select a website"
                  loading={loadingWebsites}
                  disabled={!form.getFieldValue('company_id')}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {companyWebsites.map((website) => (
                    <Option key={website.id} value={website.id} label={website.url}>
                      <Space>
                        {website.is_primary && <Tag color="blue">Primary</Tag>}
                        <span>{website.url}</span>
                        {website.title && <span style={{ color: '#999' }}> - {website.title}</span>}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Max Depth"
                name="max_depth"
                rules={[{ required: true, message: 'Please enter max depth' }]}
                tooltip="Maximum depth to crawl (0 = only the start page)"
              >
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="Max Pages"
                name="max_pages"
                rules={[{ required: true, message: 'Please enter max pages' }]}
                tooltip="Maximum number of pages to crawl"
              >
                <InputNumber min={1} max={1000} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />}>
                    Start Crawl
                  </Button>
                  <Button onClick={() => {
                    setModalVisible(false)
                    form.resetFields()
                  }}>
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </Layout>
    </Layout>
  )
}

