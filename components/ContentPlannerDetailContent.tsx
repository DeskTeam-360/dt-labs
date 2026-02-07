'use client'

import {
  Layout,
  Card,
  Button,
  Form,
  Input,
  Select,
  Switch,
  DatePicker,
  Row,
  Col,
  Typography,
  Space,
  Popconfirm,
  message,
} from 'antd'
import { ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import CustomerNavbar from './CustomerNavbar'
import dayjs from 'dayjs'

const { Text } = Typography
const { TextArea } = Input
const { Option } = Select

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'draft', label: 'Draft' },
  { value: 'ai_generated', label: 'AI Generated' },
  { value: 'human_reviewed', label: 'Human Reviewed' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
  { value: 'needs_update', label: 'Needs Update' },
]

const CTA_TYPE_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'visit_website', label: 'Visit Website' },
  { value: 'get_quote', label: 'Get Quote' },
  { value: 'book_consultation', label: 'Book Consultation' },
  { value: 'learn_more', label: 'Learn More' },
]

interface ContentPlannerDetailContentProps {
  user: User
  companyData: { id: string; name?: string }
  plannerData: any
  intents: { id: string; title: string }[]
  formats: { id: string; title: string }[]
  channels: { id: string; title: string }[]
  aiSystemTemplates: { id: string; title: string }[]
  /** 'customer' = navbar layout, back to /customer; 'admin' = sidebar layout (default) */
  variant?: 'admin' | 'customer'
}

export default function ContentPlannerDetailContent({
  user: currentUser,
  companyData,
  plannerData,
  intents,
  formats,
  channels,
  aiSystemTemplates,
  variant = 'admin',
}: ContentPlannerDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [aiContentText, setAiContentText] = useState<string>(
    plannerData?.ai_content_results?.content_text_edited ?? plannerData?.ai_content_results?.content_text ?? ''
  )

  useEffect(() => {
    setAiContentText(plannerData?.ai_content_results?.content_text_edited ?? plannerData?.ai_content_results?.content_text ?? '')
  }, [plannerData?.ai_content_results?.content_text_edited, plannerData?.ai_content_results?.content_text])
  const [ragTemplateId, setRagTemplateId] = useState<string | null>(null)
  const [ragPrompt, setRagPrompt] = useState('')
  const [form] = Form.useForm()
  const supabase = createClient()

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const ctaDynamic = !!values.cta_dynamic
      const payload = {
        channel_id: values.channel_id || null,
        topic: values.topic?.trim() || null,
        primary_keyword: values.primary_keyword?.trim() || null,
        secondary_keywords: values.secondary_keywords?.trim() || null,
        intents: Array.isArray(values.intents) ? values.intents : [],
        location: values.location?.trim() || null,
        format_id: values.format_id || null,
        cta_dynamic: ctaDynamic,
        cta_type: ctaDynamic ? null : (values.cta_type || null),
        cta_text: ctaDynamic ? null : (values.cta_text?.trim() || null),
        publish_date: values.publish_date ? values.publish_date.format('YYYY-MM-DD') : null,
        status: values.status || 'planned',
        insight: values.insight?.trim() || null,
      }

      setSaving(true)
      const { error } = await supabase
        .from('company_content_planners')
        .update(payload)
        .eq('id', plannerData.id)

      if (error) throw error
      message.success('Content planner updated')
      router.refresh()
    } catch (e: unknown) {
      const err = e as { message?: string }
      if (err?.message && !String(err.message).includes('validateFields')) {
        message.error(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    setGenerateLoading(true)
    try {
      const res = await fetch(
        `/api/companies/${companyData.id}/content-planner/${plannerData.id}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: ragTemplateId, prompt: ragPrompt.trim() || undefined }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(data?.error ?? 'Failed to generate content')
        return
      }
      message.success('Content generated and saved')
      router.refresh()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to generate')
    } finally {
      setGenerateLoading(false)
    }
  }

  const handleSaveContent = async () => {
    try {
      setSavingContent(true)
      const updatedAiResults = {
        ...(plannerData.ai_content_results || {}),
        content_text_edited: aiContentText,
      }
      const { error } = await supabase
        .from('company_content_planners')
        .update({
          ai_content_results: updatedAiResults,
          status: 'human_reviewed',
        })
        .eq('id', plannerData.id)

      if (error) throw error
      message.success('Content saved')
      router.refresh()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to save content')
    } finally {
      setSavingContent(false)
    }
  }

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('company_content_planners')
        .delete()
        .eq('id', plannerData.id)

      if (error) throw error
      message.success('Deleted')
      router.push(variant === 'customer' ? '/customer' : `/companies/${companyData.id}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message || 'Failed to delete')
    }
  }

  const isCustomer = variant === 'customer'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isCustomer ? (
        <CustomerNavbar user={currentUser} />
      ) : (
        <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      )}
      <Layout style={{ marginLeft: isCustomer ? 0 : (collapsed ? 80 : 250), transition: 'margin-left 0.2s' }}>
        <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
          <Space style={{ marginBottom: 24 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push(isCustomer ? '/customer' : `/companies/${companyData.id}`)}
            >
              Back to {isCustomer ? 'Portal' : (companyData.name || 'Company')}
            </Button>
          </Space>

          <Card title="Generate content with ChatGPT" style={{ marginBottom: 24 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Generate content based on this content planner. The system uses topic, channel, format, keywords, intent, and CTA from the form below, plus brand knowledge from the company knowledge base.
            </Text>
            <Select
              placeholder="AI System Template (optional - extra instructions)"
              value={ragTemplateId}
              onChange={setRagTemplateId}
              style={{ width: '100%', marginBottom: 12 }}
              allowClear
            >
              {aiSystemTemplates.map((t) => (
                <Option key={t.id} value={t.id}>{t.title}</Option>
              ))}
            </Select>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>Additional prompt (optional):</Text>
            <Input.TextArea
              value={ragPrompt}
              onChange={(e) => setRagPrompt(e.target.value)}
              placeholder="e.g. Generate blog post about the topic"
              rows={2}
              style={{ marginBottom: 12 }}
            />
            <Button
              type="primary"
              loading={generateLoading}
              onClick={handleGenerate}
              icon={<PlayCircleOutlined />}
            >
              Generate content
            </Button>
          </Card>

          <Card
            title={`Content Planner: ${plannerData.topic || 'Untitled'}`}
            extra={
              <Space>
                <Popconfirm
                  title="Delete this content planner?"
                  onConfirm={handleDelete}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger>Delete</Button>
                </Popconfirm>
                <Button type="primary" onClick={handleSave} loading={saving}>
                  Save
                </Button>
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                channel_id: plannerData.channel_id || undefined,
                topic: plannerData.topic || '',
                primary_keyword: plannerData.primary_keyword || '',
                secondary_keywords: plannerData.secondary_keywords || '',
                intents: plannerData.intents || [],
                location: plannerData.location || '',
                format_id: plannerData.format_id || undefined,
                cta_dynamic: plannerData.cta_dynamic ?? true,
                cta_type: plannerData.cta_type || undefined,
                cta_text: plannerData.cta_text || '',
                publish_date: plannerData.publish_date ? dayjs(plannerData.publish_date) : null,
                status: plannerData.status || 'planned',
                insight: plannerData.insight || '',
              }}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="topic" label="Topic">
                    <Input placeholder="Topic" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="primary_keyword" label="Primary Keyword">
                    <Input placeholder="Primary keyword" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="channel_id" label="Channel">
                    <Select placeholder="Select channel" allowClear>
                      {channels.map((c) => (
                        <Option key={c.id} value={c.id}>{c.title}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="format_id" label="Format">
                    <Select placeholder="Select format" allowClear>
                      {formats.map((f) => (
                        <Option key={f.id} value={f.id}>{f.title}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="intents" label="Intents">
                <Select mode="multiple" placeholder="Select intents" allowClear>
                  {intents.map((i) => (
                    <Option key={i.id} value={i.id}>{i.title}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="secondary_keywords" label="Secondary Keywords">
                <Input placeholder="Comma-separated or free text" />
              </Form.Item>
              <Form.Item name="location" label="Location">
                <Input placeholder="Location" />
              </Form.Item>
              <Form.Item name="cta_dynamic" label="CTA Dynamic" valuePropName="checked">
                <Switch checkedChildren="Dynamic" unCheckedChildren="Fixed" />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.cta_dynamic !== curr.cta_dynamic}
              >
                {({ getFieldValue }) =>
                  !getFieldValue('cta_dynamic') ? (
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="cta_type"
                          label="CTA Type"
                          rules={[{ required: true, message: 'Required when CTA is fixed' }]}
                        >
                          <Select placeholder="Select CTA type">
                            {CTA_TYPE_OPTIONS.map((o) => (
                              <Option key={o.value} value={o.value}>{o.label}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="cta_text"
                          label="CTA Text"
                          rules={[{ required: true, message: 'Required when CTA is fixed' }]}
                        >
                          <Input placeholder="CTA text" />
                        </Form.Item>
                      </Col>
                    </Row>
                  ) : null
                }
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="publish_date" label="Publish Date">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                    <Select>
                      {STATUS_OPTIONS.map((o) => (
                        <Option key={o.value} value={o.value}>{o.label}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="insight" label="Insight">
                <TextArea rows={3} placeholder="Insight or notes" />
              </Form.Item>
              {plannerData.ai_content_results ? (
                <Form.Item
                  label={
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <span>AI Content · Compare side by side</span>
                      <Button
                        type="primary"
                        size="small"
                        icon={<SaveOutlined />}
                        loading={savingContent}
                        onClick={handleSaveContent}
                      >
                        Save edited
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={16}>
                    <Col xs={24} lg={12}>
                      <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Original (AI)</Text>
                      <div
                        style={{
                          padding: 16,
                          background: '#fafafa',
                          borderRadius: 8,
                          border: '1px solid #f0f0f0',
                          minHeight: 280,
                          maxHeight: 400,
                          overflow: 'auto',
                          fontSize: 14,
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {plannerData.ai_content_results?.content_text ?? '—'}
                      </div>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Edited (editable)</Text>
                      <TextArea
                        value={aiContentText}
                        onChange={(e) => setAiContentText(e.target.value)}
                        rows={12}
                        style={{
                          fontSize: 14,
                          lineHeight: 1.6,
                          minHeight: 280,
                        }}
                        placeholder="Edit content here..."
                      />
                    </Col>
                  </Row>
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                    Model: {plannerData.ai_content_results?.ai_model ?? '—'} · Generated: {plannerData.ai_content_results?.generated_date ? new Date(plannerData.ai_content_results.generated_date).toLocaleString() : '—'}
                  </Text>
                </Form.Item>
              ) : null}
            </Form>
          </Card>
        </div>
      </Layout>
    </Layout>
  )
}
