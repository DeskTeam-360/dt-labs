'use client'

import { Layout, Card, Descriptions, Tag, Typography, Button, Space, Row, Col, Divider, Tabs, Form, Input, message, Spin, Select, Table, Popconfirm, Switch, Modal, Progress } from 'antd'
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, TeamOutlined, DatabaseOutlined, SaveOutlined, FileTextOutlined, PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined, PlayCircleOutlined, EyeOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import { createClient } from '@/utils/supabase/client'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

interface CompanyDetailContentProps {
  user: User
  companyData: any
}

export default function CompanyDetailContent({ user: currentUser, companyData }: CompanyDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm()
  const [generateForm] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [dataTemplates, setDataTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [contentTemplates, setContentTemplates] = useState<any[]>([])
  const [loadingContentTemplates, setLoadingContentTemplates] = useState(false)
  const [selectedContentTemplate, setSelectedContentTemplate] = useState<string | null>(null)
  const [generatedContent, setGeneratedContent] = useState<string>('')
  const [websites, setWebsites] = useState<any[]>([])
  const [loadingWebsites, setLoadingWebsites] = useState(false)
  const [websiteModalVisible, setWebsiteModalVisible] = useState(false)
  const [editingWebsite, setEditingWebsite] = useState<any>(null)
  const [websiteForm] = Form.useForm()
  const [crawlSessions, setCrawlSessions] = useState<any[]>([])
  const [loadingCrawlSessions, setLoadingCrawlSessions] = useState(false)
  const [crawlModalVisible, setCrawlModalVisible] = useState(false)
  const [crawlForm] = Form.useForm()
  const supabase = createClient()

  // Group company datas by template group
  const groupedDatas = (companyData.company_datas || []).reduce((acc: any, item: any) => {
    const group = item.company_data_templates?.group || 'Other'
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(item)
    return acc
  }, {})

  // Create map of existing company_datas for easy lookup
  const existingDatasMap = (companyData.company_datas || []).reduce((acc: any, item: any) => {
    acc[item.data_template_id] = item.value || ''
    return acc
  }, {})

  useEffect(() => {
    fetchDataTemplates()
    fetchContentTemplates()
    fetchWebsites()
  }, [])

  useEffect(() => {
    if (websites.length > 0) {
      fetchCrawlSessions()
    }
  }, [websites])

  // Re-initialize form when dataTemplates are loaded and company_datas are available
  useEffect(() => {
    if (dataTemplates.length > 0) {
      const freshDatasMap = (companyData.company_datas || []).reduce((acc: any, item: any) => {
        // Handle both direct data_template_id and nested structure
        const templateId = item.data_template_id || item.company_data_templates?.id
        const value = item.value || ''
        if (templateId) {
          acc[templateId] = value
        }
        return acc
      }, {})
      
      console.log('Company datas:', companyData.company_datas)
      console.log('Fresh datas map:', freshDatasMap)
      console.log('Data templates:', dataTemplates)
      
      const formValues: any = {}
      dataTemplates.forEach((template: any) => {
        const existingValue = freshDatasMap[template.id]
        formValues[`template_${template.id}`] = existingValue !== undefined && existingValue !== null ? existingValue : ''
      })
      
      console.log('Form values to set:', formValues)
      
      // Use a small delay to ensure form is ready
      const timer = setTimeout(() => {
        form.setFieldsValue(formValues)
        console.log('Form values after setFieldsValue:', form.getFieldsValue())
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [dataTemplates, companyData.company_datas, form])

  useEffect(() => {
    if (selectedContentTemplate) {
      generateContent()
    } else {
      setGeneratedContent('')
    }
  }, [selectedContentTemplate])

  useEffect(() => {
    if (selectedContentTemplate) {
      generateContent()
    }
  }, [companyData.company_datas])

  const fetchDataTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const { data, error } = await supabase
        .from('company_data_templates')
        .select('*')
        .eq('is_active', true)
        .order('group', { ascending: true })
        .order('title', { ascending: true })

      if (error) throw error

      setDataTemplates(data || [])
      
      // Initialize form with existing values after templates are loaded
      // Recreate existingDatasMap from fresh companyData
      const freshDatasMap = (companyData.company_datas || []).reduce((acc: any, item: any) => {
        acc[item.data_template_id] = item.value || ''
        return acc
      }, {})
      
      console.log('Company datas:', companyData.company_datas)
      console.log('Fresh datas map:', freshDatasMap)
      console.log('Data templates:', data)
      
      const formValues: any = {}
      if (data) {
        data.forEach((template: any) => {
          const existingValue = freshDatasMap[template.id]
          console.log(`Template ${template.id} (${template.title}): existingValue =`, existingValue)
          
          // Set value even if empty (so form knows about the field)
          if (existingValue !== undefined && existingValue !== null) {
            formValues[`template_${template.id}`] = existingValue
          } else {
            formValues[`template_${template.id}`] = ''
          }
        })
      }
      
      console.log('Form values to set:', formValues)
      
      // Use setTimeout to ensure form is ready
      setTimeout(() => {
        form.setFieldsValue(formValues)
        console.log('Form values after setFieldsValue:', form.getFieldsValue())
      }, 100)
    } catch (error: any) {
      message.error('Failed to load data templates')
      console.error('Error fetching data templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchContentTemplates = async () => {
    setLoadingContentTemplates(true)
    try {
      const { data, error } = await supabase
        .from('company_content_templates')
        .select('*')
        .order('title', { ascending: true })

      if (error) throw error

      setContentTemplates(data || [])
    } catch (error: any) {
      message.error('Failed to load content templates')
      console.error('Error fetching content templates:', error)
    } finally {
      setLoadingContentTemplates(false)
    }
  }

  const fetchWebsites = async () => {
    setLoadingWebsites(true)
    try {
      const { data, error } = await supabase
        .from('company_websites')
        .select('*')
        .eq('company_id', companyData.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      setWebsites(data || [])
    } catch (error: any) {
      message.error('Failed to load websites')
      console.error('Error fetching websites:', error)
    } finally {
      setLoadingWebsites(false)
    }
  }

  const fetchCrawlSessions = async () => {
    setLoadingCrawlSessions(true)
    try {
      // Get all website IDs for this company
      const websiteIds = websites.length > 0 ? websites.map(w => w.id) : (companyData.company_websites || []).map((w: any) => w.id)
      
      if (websiteIds.length === 0) {
        setCrawlSessions([])
        setLoadingCrawlSessions(false)
        return
      }

      const { data, error } = await supabase
        .from('crawl_sessions')
        .select(`
          *,
          company_websites (
            id,
            url,
            title
          )
        `)
        .in('company_website_id', websiteIds)
        .order('created_at', { ascending: false })

      if (error) throw error

      setCrawlSessions(data || [])
    } catch (error: any) {
      message.error('Failed to load crawl sessions')
      console.error('Error fetching crawl sessions:', error)
    } finally {
      setLoadingCrawlSessions(false)
    }
  }

  const generateContent = () => {
    if (!selectedContentTemplate) {
      setGeneratedContent('')
      return
    }

    // Find the selected content template
    const contentTemplate = contentTemplates.find((t) => t.id === selectedContentTemplate)
    if (!contentTemplate || !contentTemplate.content) {
      setGeneratedContent('')
      return
    }

    // Create multiple maps for different lookup methods
    // 1. Map by template ID (existing data)
    const dataMapById: { [key: string]: string } = {}
    // 2. Map by template title (normalized - lowercase, no spaces)
    const dataMapByTitle: { [key: string]: string } = {}
    // 3. Map by template ID to title (for reverse lookup)
    const templateIdToTitle: { [key: string]: string } = {}

    // Build template ID to title map first
    dataTemplates.forEach((template: any) => {
      if (template.id && template.title) {
        templateIdToTitle[template.id] = template.title.toLowerCase().replace(/\s+/g, '')
      }
    })

    // Build data maps from company_datas
    if (companyData.company_datas) {
      companyData.company_datas.forEach((item: any) => {
        const templateId = item.data_template_id || item.company_data_templates?.id
        const value = item.value || ''
        
        if (templateId) {
          // Map by ID
          dataMapById[templateId] = value
          
          // Map by title (normalized)
          const template = dataTemplates.find((t: any) => t.id === templateId)
          if (template && template.title) {
            const normalizedTitle = template.title.toLowerCase().replace(/\s+/g, '')
            dataMapByTitle[normalizedTitle] = value
          }
        }
      })
    }

    console.log('Generate Content - Data Map by ID:', dataMapById)
    console.log('Generate Content - Data Map by Title:', dataMapByTitle)
    console.log('Generate Content - Template ID to Title:', templateIdToTitle)

    // Replace placeholders {{template-id}} or {{template-title}} with actual values
    let generated = contentTemplate.content
    const placeholderRegex = /\{\{([^}]+)\}\}/g
    
    generated = generated.replace(placeholderRegex, (match: string, placeholder: string) => {
      const normalizedPlaceholder = placeholder.trim().toLowerCase().replace(/\s+/g, '')
      
      // Try to find value by:
      // 1. Exact ID match (original format - e.g., {{uuid-123}})
      let value = dataMapById[placeholder.trim()]
      
      // 2. If not found, try normalized title match (e.g., {{company}})
      if (!value && normalizedPlaceholder) {
        value = dataMapByTitle[normalizedPlaceholder]
      }
      
      // 3. If still not found, try to find template by title and get its ID
      if (!value) {
        const matchingTemplate = dataTemplates.find((t: any) => {
          const normalizedTemplateTitle = (t.title || '').toLowerCase().replace(/\s+/g, '')
          return normalizedTemplateTitle === normalizedPlaceholder
        })
        
        if (matchingTemplate && matchingTemplate.id) {
          value = dataMapById[matchingTemplate.id]
        }
      }
      
      // Return value if found, otherwise return original placeholder
      return value !== undefined && value !== null && value !== '' ? value : match
    })

    console.log('Generate Content - Original:', contentTemplate.content)
    console.log('Generate Content - Generated:', generated)

    setGeneratedContent(generated)
  }

  const handleContentTemplateChange = (templateId: string) => {
    setSelectedContentTemplate(templateId)
    generateForm.setFieldsValue({ content_template_id: templateId })
  }

  const handleWebsiteCreate = () => {
    setEditingWebsite(null)
    websiteForm.resetFields()
    websiteForm.setFieldsValue({
      is_primary: false,
    })
    setWebsiteModalVisible(true)
  }

  const handleWebsiteEdit = (website: any) => {
    setEditingWebsite(website)
    websiteForm.setFieldsValue({
      url: website.url,
      title: website.title || '',
      description: website.description || '',
      is_primary: website.is_primary || false,
    })
    setWebsiteModalVisible(true)
  }

  const handleWebsiteSubmit = async (values: any) => {
    try {
      if (editingWebsite) {
        // Update existing website
        // If setting as primary, unset other primary websites
        if (values.is_primary) {
          await supabase
            .from('company_websites')
            .update({ is_primary: false })
            .eq('company_id', companyData.id)
            .eq('is_primary', true)
        }

        const { error } = await supabase
          .from('company_websites')
          .update({
            url: values.url,
            title: values.title || null,
            description: values.description || null,
            is_primary: values.is_primary || false,
          })
          .eq('id', editingWebsite.id)

        if (error) throw error

        message.success('Website updated successfully')
      } else {
        // Create new website
        // If setting as primary, unset other primary websites
        if (values.is_primary) {
          await supabase
            .from('company_websites')
            .update({ is_primary: false })
            .eq('company_id', companyData.id)
            .eq('is_primary', true)
        }

        const { error } = await supabase
          .from('company_websites')
          .insert({
            company_id: companyData.id,
            url: values.url,
            title: values.title || null,
            description: values.description || null,
            is_primary: values.is_primary || false,
          })

        if (error) throw error

        message.success('Website created successfully')
      }

      setWebsiteModalVisible(false)
      websiteForm.resetFields()
      fetchWebsites()
    } catch (error: any) {
      message.error(error.message || 'Failed to save website')
    }
  }

  const handleWebsiteDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('company_websites')
        .delete()
        .eq('id', id)

      if (error) throw error

      message.success('Website deleted successfully')
      fetchWebsites()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete website')
    }
  }

  const handleStartCrawl = () => {
    if (websites.length === 0) {
      message.warning('Please add at least one website first')
      return
    }
    crawlForm.resetFields()
    crawlForm.setFieldsValue({
      max_depth: 3,
      max_pages: 100,
    })
    setCrawlModalVisible(true)
  }

  const handleCrawlSubmit = async (values: any) => {
    try {
      const { startCrawl } = await import('@/app/actions/crawl')
      const result = await startCrawl({
        company_website_id: values.company_website_id,
        max_depth: values.max_depth || 3,
        max_pages: values.max_pages || 100,
      })

      if (result.error) {
        message.error(result.error)
      } else {
        message.success('Crawl session started successfully')
        setCrawlModalVisible(false)
        crawlForm.resetFields()
        fetchCrawlSessions()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to start crawl')
    }
  }

  const getCrawlStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'crawling':
        return 'blue'
      case 'failed':
        return 'red'
      case 'broken-page':
        return 'orange'
      case 'pending':
        return 'orange'
      case 'uncrawl-page':
        return 'geekblue'
      default:
        return 'default'
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const values = form.getFieldsValue()
      
      console.log('Form values:', values)
      console.log('Company ID:', companyData.id)
      console.log('Data templates:', dataTemplates)
      
      // Prepare data for API - only include data with non-empty values
      const datas = dataTemplates
        .map((template) => {
          const value = values[`template_${template.id}`]
          // Only include if value is not null, undefined, or empty string (after trim)
          if (value && typeof value === 'string' && value.trim() !== '') {
            return {
              data_template_id: template.id,
              value: value.trim(),
            }
          }
          return null
        })
        .filter((item) => item !== null) // Remove null entries

      console.log('Datas to save:', datas)

      // If no data to save, show message
      if (datas.length === 0) {
        message.warning('No data to save. Please fill in at least one field.')
        setSaving(false)
        return
      }

      // Ensure companyData.id exists
      if (!companyData.id) {
        throw new Error('Company ID is missing')
      }

      const response = await fetch(`/api/companies/${companyData.id}/company-datas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ datas }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save company data')
      }

      message.success(`${datas.length} data field(s) saved successfully`)
      
      // Refresh the page to show updated data
      router.refresh()
    } catch (error: any) {
      message.error(error.message || 'Failed to save company data')
      console.error('Error saving company data:', error)
    } finally {
      setSaving(false)
    }
  }

  const tabItems = [
    {
      key: 'info',
      label: 'Company Information',
      children: (
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={12}>
            <Card title="Basic Information" size="small">
              <Descriptions column={1} bordered>
                <Descriptions.Item label="Company Name">
                  <Text strong>{companyData.name}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={companyData.is_active ? 'green' : 'default'} style={{ fontSize: 14, padding: '4px 12px' }}>
                    {companyData.is_active ? (
                      <>
                        <CheckCircleOutlined /> ACTIVE
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined /> INACTIVE
                      </>
                    )}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Company ID">
                  <Text code style={{ fontSize: 12 }}>
                    {companyData.id}
                  </Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title="Activity" size="small">
              <Descriptions column={1} bordered>
                <Descriptions.Item label="Created At">
                  <Space>
                    <CalendarOutlined />
                    <DateDisplay date={companyData.created_at} format="detailed" />
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Last Updated">
                  <Space>
                    <ClockCircleOutlined />
                    <DateDisplay date={companyData.updated_at} format="detailed" />
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'users',
      label: (
        <span>
          <TeamOutlined /> Users ({companyData.company_users?.length || 0})
        </span>
      ),
      children: (
        <Card>
          {companyData.company_users && companyData.company_users.length > 0 ? (
            <Descriptions bordered column={1}>
              {companyData.company_users.map((cu: any, index: number) => (
                <Descriptions.Item
                  key={index}
                  label={cu.users?.full_name || cu.users?.email || 'User'}
                >
                  <Space direction="vertical" size="small">
                    <Text>
                      <strong>Email:</strong> {cu.users?.email || 'N/A'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Added: <DateDisplay date={cu.created_at} />
                    </Text>
                  </Space>
                </Descriptions.Item>
              ))}
            </Descriptions>
          ) : (
            <Text type="secondary">No users assigned to this company</Text>
          )}
        </Card>
      ),
    },
    {
      key: 'data-form',
      label: (
        <span>
          <DatabaseOutlined /> Company Data (Form)
        </span>
      ),
      children: (
        <div>
          {loadingTemplates ? (
            <Card>
              <Spin tip="Loading data templates..." />
            </Card>
          ) : (
            <Form form={form} layout="vertical">
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card>
                  <Space>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={handleSaveAll}
                      loading={saving}
                      size="large"
                    >
                      Save All
                    </Button>
                    <Text type="secondary">Save all company data templates</Text>
                  </Space>
                </Card>

                {dataTemplates.length > 0 ? (
                  (() => {
                    // Group templates by group
                    const groupedTemplates = dataTemplates.reduce((acc: any, template: any) => {
                      const group = template.group || 'Other'
                      if (!acc[group]) {
                        acc[group] = []
                      }
                      acc[group].push(template)
                      return acc
                    }, {})

                    return Object.entries(groupedTemplates).map(([group, templates]: [string, any]) => (
                      <Card
                        key={group}
                        title={group}
                        style={{ marginBottom: 16 }}
                      >
                        <Row gutter={[16, 16]}>
                          {templates.map((template: any) => (
                            <Col xs={24} sm={12} key={template.id}>
                              <Form.Item
                                label={template.title}
                                name={`template_${template.id}`}
                                tooltip={template.id}
                              >
                                <TextArea
                                  rows={3}
                                  placeholder={`Enter ${template.title.toLowerCase()}...`}
                                  showCount
                                />
                              </Form.Item>
                            </Col>
                          ))}
                        </Row>
                      </Card>
                    ))
                  })()
                ) : (
                  <Card>
                    <Text type="secondary">No active data templates available</Text>
                  </Card>
                )}
              </Space>
            </Form>
          )}
        </div>
      ),
    },
    {
      key: 'data-view',
      label: (
        <span>
          <DatabaseOutlined /> Data View ({companyData.company_datas?.length || 0})
        </span>
      ),
      children: (
        <div>
          {Object.keys(groupedDatas).length > 0 ? (
            Object.entries(groupedDatas).map(([group, items]: [string, any]) => (
              <Card
                key={group}
                title={group}
                style={{ marginBottom: 16 }}
                size="small"
              >
                <Descriptions bordered column={1}>
                  {items.map((item: any, index: number) => (
                    <Descriptions.Item
                      key={index}
                      label={item.company_data_templates?.title || 'Data'}
                    >
                      <Space direction="vertical" size="small">
                        <Text>{item.value || 'N/A'}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Updated: <DateDisplay date={item.updated_at} />
                        </Text>
                      </Space>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            ))
          ) : (
            <Card>
              <Text type="secondary">No data available for this company</Text>
            </Card>
          )}
        </div>
      ),
    },
    {
      key: 'generate',
      label: (
        <span>
          <FileTextOutlined /> Generate Content
        </span>
      ),
      children: (
        <div>
          <Form form={generateForm} layout="vertical">
            <Card style={{ marginBottom: 16 }}>
              <Form.Item
                label="Content Template"
                name="content_template_id"
                rules={[{ required: true, message: 'Please select a content template' }]}
              >
                <Select
                  placeholder="Select a content template"
                  size="large"
                  loading={loadingContentTemplates}
                  onChange={handleContentTemplateChange}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {contentTemplates.map((template) => (
                    <Option key={template.id} value={template.id} label={template.title}>
                      <Space>
                        <FileTextOutlined />
                        <Text strong>{template.title}</Text>
                        {template.description && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            - {template.description}
                          </Text>
                        )}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Card>

            {generatedContent && (
              <Card title="Generated Content">
                <div
                  style={{
                    padding: 16,
                    background: '#f5f5f5',
                    borderRadius: 4,
                    whiteSpace: 'pre-wrap',
                    minHeight: 200,
                    maxHeight: 600,
                    overflow: 'auto',
                  }}
                  dangerouslySetInnerHTML={{ __html: generatedContent }}
                />
                <Divider />
                <Space>
                  <Button
                    type="primary"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedContent.replace(/<[^>]*>/g, ''))
                      message.success('Content copied to clipboard')
                    }}
                  >
                    Copy Text
                  </Button>
                  <Button
                    onClick={() => {
                      const blob = new Blob([generatedContent], { type: 'text/html' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `generated-content-${Date.now()}.html`
                      a.click()
                      URL.revokeObjectURL(url)
                      message.success('Content downloaded')
                    }}
                  >
                    Download HTML
                  </Button>
                </Space>
              </Card>
            )}

            {selectedContentTemplate && !generatedContent && (
              <Card>
                <Text type="secondary">
                  No data available for this template, or template is empty.
                </Text>
              </Card>
            )}

            {!selectedContentTemplate && (
              <Card>
                <Text type="secondary">Please select a content template to generate content.</Text>
              </Card>
            )}
          </Form>
        </div>
      ),
    },
    {
      key: 'websites',
      label: (
        <span>
          <GlobalOutlined /> Websites ({websites.length})
        </span>
      ),
      children: (
        <div>
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleWebsiteCreate}
                size="large"
              >
                Add Website
              </Button>
              <Text type="secondary">Manage company websites</Text>
            </Space>

            {loadingWebsites ? (
              <Spin tip="Loading websites..." />
            ) : websites.length > 0 ? (
              <Table
                dataSource={websites}
                rowKey="id"
                columns={[
                  {
                    title: 'URL',
                    dataIndex: 'url',
                    key: 'url',
                    render: (url: string) => (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                      </a>
                    ),
                    ellipsis: true,
                  },
                  {
                    title: 'Title',
                    dataIndex: 'title',
                    key: 'title',
                    render: (title: string | null) => title || '-',
                  },
                  {
                    title: 'Primary',
                    dataIndex: 'is_primary',
                    key: 'is_primary',
                    render: (isPrimary: boolean) => (
                      <Tag color={isPrimary ? 'blue' : 'default'}>
                        {isPrimary ? 'Primary' : '-'}
                      </Tag>
                    ),
                    width: 100,
                  },
                  {
                    title: 'Created At',
                    key: 'created_at',
                    render: (_, record) => <DateDisplay date={record.created_at} />,
                    width: 180,
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 150,
                    render: (_, record) => (
                      <Space>
                        <Button
                          type="link"
                          icon={<EditOutlined />}
                          onClick={() => handleWebsiteEdit(record)}
                        >
                          Edit
                        </Button>
                        <Popconfirm
                          title="Delete website"
                          description="Are you sure you want to delete this website?"
                          onConfirm={() => handleWebsiteDelete(record.id)}
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
                ]}
                pagination={false}
              />
            ) : (
              <Card>
                <Space direction="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
                  <GlobalOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
                  <Text type="secondary">No websites added yet</Text>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleWebsiteCreate}
                  >
                    Add First Website
                  </Button>
                </Space>
              </Card>
            )}
          </Card>
        </div>
      ),
    },
    {
      key: 'crawling',
      label: (
        <span>
          <GlobalOutlined /> Crawling ({crawlSessions.length})
        </span>
      ),
      children: (
        <div>
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartCrawl}
                disabled={websites.length === 0}
                size="large"
              >
                Start New Crawl
              </Button>
              {websites.length === 0 && (
                <Text type="secondary">Please add a website first</Text>
              )}
            </Space>

            {loadingCrawlSessions ? (
              <Spin tip="Loading crawl sessions..." />
            ) : crawlSessions.length > 0 ? (
              <Table
                dataSource={crawlSessions}
                rowKey="id"
                columns={[
                  {
                    title: 'Website',
                    key: 'website',
                    render: (_, record) => (
                      <a href={record.company_websites?.url} target="_blank" rel="noopener noreferrer">
                        {record.company_websites?.url}
                      </a>
                    ),
                    ellipsis: true,
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status: string) => (
                      <Tag color={getCrawlStatusColor(status)} style={{ textTransform: 'uppercase' }}>
                        {status}
                      </Tag>
                    ),
                    width: 120,
                  },
                  {
                    title: 'Progress',
                    key: 'progress',
                    render: (_, record) => {
                      const getProgressPercent = () => {
                        const total = record.total_pages || 0
                        const crawled = record.crawled_pages || 0
                        if (total === 0) return 0
                        return Math.round((crawled / total) * 100)
                      }

                      return (
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Progress 
                            percent={getProgressPercent()} 
                            status={record.status === 'crawling' ? 'active' : record.status === 'completed' ? 'success' : 'normal'}
                            size="small"
                          />
                          <Space wrap>
                            <Tag color="green">
                              <CheckCircleOutlined /> Crawled: <strong>{record.crawled_pages || 0}</strong>
                            </Tag>
                            {(record.uncrawled_pages || 0) > 0 && (
                              <Tag color="geekblue">
                                Uncrawled: <strong>{record.uncrawled_pages || 0}</strong>
                              </Tag>
                            )}
                            {(record.broken_pages || 0) > 0 && (
                              <Tag color="orange">
                                <CloseCircleOutlined /> Broken: <strong>{record.broken_pages || 0}</strong>
                              </Tag>
                            )}
                            {(record.failed_pages || 0) > 0 && (
                              <Tag color="red">
                                <CloseCircleOutlined /> Failed: <strong>{record.failed_pages || 0}</strong>
                              </Tag>
                            )}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Total Pages: <strong>{record.total_pages || 0}</strong>
                          </Text>
                        </Space>
                      )
                    },
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
                    width: 180,
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 100,
                    render: (_, record) => (
                      <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => router.push(`/crawl-sessions/${record.id}`)}
                      >
                        View
                      </Button>
                    ),
                  },
                ]}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `Total ${total} crawl sessions`,
                }}
              />
            ) : (
              <Card>
                <Space direction="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
                  <GlobalOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
                  <Text type="secondary">No crawl sessions yet</Text>
                  {websites.length > 0 && (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleStartCrawl}
                    >
                      Start First Crawl
                    </Button>
                  )}
                </Space>
              </Card>
            )}
          </Card>
        </div>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Space style={{ marginBottom: 24 }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push('/companies')}
              >
                Back to Companies
              </Button>
            </Space>

            <div style={{ marginBottom: 32 }}>
              <Title level={2} style={{ marginBottom: 8 }}>
                {companyData.name}
              </Title>
              <Space size="middle">
                <Tag color={companyData.is_active ? 'green' : 'default'} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {companyData.is_active ? 'ACTIVE' : 'INACTIVE'}
                </Tag>
              </Space>
            </div>

            <Divider />

            <Tabs items={tabItems} />

            {/* Website Modal */}
            <Modal
              title={
                <Space>
                  <GlobalOutlined />
                  <span>{editingWebsite ? 'Edit Website' : 'Add New Website'}</span>
                </Space>
              }
              open={websiteModalVisible}
              onCancel={() => {
                setWebsiteModalVisible(false)
                websiteForm.resetFields()
                setEditingWebsite(null)
              }}
              footer={null}
              width={700}
              destroyOnClose
            >
              <Form
                form={websiteForm}
                layout="vertical"
                onFinish={handleWebsiteSubmit}
                requiredMark={false}
              >
                <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5' }}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Text strong>Website Information</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Add a website URL for this company. You can set one website as primary.
                    </Text>
                  </Space>
                </Card>

                <Form.Item
                  label={
                    <Space>
                      <Text strong>Website URL</Text>
                      <Text type="danger">*</Text>
                    </Space>
                  }
                  name="url"
                  rules={[
                    { required: true, message: 'Please enter website URL' },
                    { 
                      type: 'url', 
                      message: 'Please enter a valid URL (e.g., https://example.com)',
                      warningOnly: false
                    }
                  ]}
                  tooltip="Enter the full URL including http:// or https://"
                >
                  <Input 
                    placeholder="https://example.com"
                    prefix={<GlobalOutlined style={{ color: '#bfbfbf' }} />}
                    size="large"
                    allowClear
                  />
                </Form.Item>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>Title</Text>}
                      name="title"
                      tooltip="Optional: A friendly name for this website"
                    >
                      <Input 
                        placeholder="e.g., Main Website, Blog, Store"
                        size="large"
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>Primary Website</Text>}
                      name="is_primary"
                      valuePropName="checked"
                      tooltip="Set this as the primary website. Only one website can be primary."
                    >
                      <div>
                        <Switch 
                          checkedChildren="Yes" 
                          unCheckedChildren="No"
                          style={{ marginRight: 8 }}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Mark as primary
                        </Text>
                      </div>
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  label={<Text strong>Description</Text>}
                  name="description"
                  tooltip="Optional: Additional notes about this website"
                >
                  <TextArea 
                    rows={4}
                    placeholder="Add any notes or description about this website..."
                    showCount
                    maxLength={500}
                    style={{ resize: 'none' }}
                  />
                </Form.Item>

                <Divider />

                <Form.Item style={{ marginBottom: 0 }}>
                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button 
                      onClick={() => {
                        setWebsiteModalVisible(false)
                        websiteForm.resetFields()
                        setEditingWebsite(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="primary" 
                      htmlType="submit"
                      icon={editingWebsite ? <EditOutlined /> : <PlusOutlined />}
                      size="large"
                    >
                      {editingWebsite ? 'Update Website' : 'Add Website'}
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            </Modal>

            {/* Crawl Modal */}
            <Modal
              title="Start New Crawl"
              open={crawlModalVisible}
              onCancel={() => {
                setCrawlModalVisible(false)
                crawlForm.resetFields()
              }}
              footer={null}
              width={600}
            >
              <Form
                form={crawlForm}
                layout="vertical"
                onFinish={handleCrawlSubmit}
              >
                <Form.Item
                  label="Website"
                  name="company_website_id"
                  rules={[{ required: true, message: 'Please select a website' }]}
                >
                  <Select placeholder="Select a website" showSearch>
                    {websites.map((website) => (
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
                  <Input type="number" min={0} max={10} />
                </Form.Item>

                <Form.Item
                  label="Max Pages"
                  name="max_pages"
                  rules={[{ required: true, message: 'Please enter max pages' }]}
                  tooltip="Maximum number of pages to crawl"
                >
                  <Input type="number" min={1} max={1000} />
                </Form.Item>

                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />}>
                      Start Crawl
                    </Button>
                    <Button onClick={() => {
                      setCrawlModalVisible(false)
                      crawlForm.resetFields()
                    }}>
                      Cancel
                    </Button>
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

