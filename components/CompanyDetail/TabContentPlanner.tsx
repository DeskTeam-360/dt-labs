'use client'

import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  DatePicker,
  Spin,
  Tag,
  Row,
  Col,
  message,
} from 'antd'
import { PlusOutlined, EditOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import DateDisplay from '../DateDisplay'
import type { ColumnsType } from 'antd/es/table'

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

interface TabContentPlannerProps {
  companyData: { id: string; name?: string }
  /** When set (e.g. /customer), links go to basePath/content-planner/[id]; else /companies/[id]/content-planner/[id] */
  basePath?: string
}

interface ContentPlannerRecord {
  id: string
  company_id: string
  channel_id: string | null
  topic: string | null
  primary_keyword: string | null
  secondary_keywords: string | null
  intents: string[]
  location: string | null
  format_id: string | null
  cta_dynamic: boolean
  cta_type: string | null
  cta_text: string | null
  publish_date: string | null
  status: string
  insight: string | null
  ai_content_results: Record<string, unknown> | null
  created_at: string
  updated_at: string
  channel?: { id: string; title: string } | null
  format?: { id: string; title: string } | null
}

export default function TabContentPlanner({ companyData, basePath }: TabContentPlannerProps) {
  const router = useRouter()
  const supabase = createClient()
  const [planners, setPlanners] = useState<ContentPlannerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [intents, setIntents] = useState<{ id: string; title: string }[]>([])
  const [formats, setFormats] = useState<{ id: string; title: string }[]>([])
  const [channels, setChannels] = useState<{ id: string; title: string }[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [generatorModalVisible, setGeneratorModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatorSaving, setGeneratorSaving] = useState(false)
  const [generateLoadingId, setGenerateLoadingId] = useState<string | null>(null)
  const [form] = Form.useForm()
  const [generatorForm] = Form.useForm()

  const fetchPlanners = async () => {
    if (!companyData?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('company_content_planners')
        .select(`
          *,
          channel:content_planner_channels(id, title),
          format:content_planner_formats(id, title)
        `)
        .eq('company_id', companyData.id)
        .order('publish_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setPlanners((data || []) as ContentPlannerRecord[])
    } catch (e: unknown) {
      const err = e as { message?: string }
      console.error('Failed to fetch planners:', err?.message)
      setPlanners([])
    } finally {
      setLoading(false)
    }
  }

  const fetchLookups = async () => {
    try {
      const [intentsRes, formatsRes, channelsRes] = await Promise.all([
        supabase.from('content_planner_intents').select('id, title').order('title'),
        supabase.from('content_planner_formats').select('id, title').order('title'),
        supabase.from('content_planner_channels').select('id, title').order('title'),
      ])
      setIntents(intentsRes.data || [])
      setFormats(formatsRes.data || [])
      setChannels(channelsRes.data || [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchPlanners()
    fetchLookups()
  }, [companyData?.id])

  const handleCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      cta_dynamic: true,
      status: 'draft',
    })
    setModalVisible(true)
  }

  const handleOpenGenerator = () => {
    generatorForm.resetFields()
    generatorForm.setFieldsValue({
      gbp_per_week: 0,
      social_per_week: 0,
      blogs_per_week: 0,
      preferred_post_days: 'Mon, Fri',
    })
    setGeneratorModalVisible(true)
  }

  const handleGeneratorSubmit = async () => {
    try {
      const values = await generatorForm.validateFields()
      const gbp = values.gbp_per_week ?? 0
      const social = values.social_per_week ?? 0
      const blogs = values.blogs_per_week ?? 0
      if (gbp + social + blogs === 0) {
        message.error('Minimal satu dari GBP, Social, atau Blogs harus > 0')
        return
      }
      setGeneratorSaving(true)
      const res = await fetch(`/api/companies/${companyData.id}/content-planner/generate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gbp_per_week: gbp,
          social_per_week: social,
          blogs_per_week: blogs,
          preferred_post_days: values.preferred_post_days?.trim() || 'Mon, Fri',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(data?.error ?? 'Gagal generate planners')
        return
      }
      message.success(`${data.created ?? 0} content planner dibuat`)
      setGeneratorModalVisible(false)
      fetchPlanners()
    } catch (e: unknown) {
      if (String((e as { message?: string })?.message || '').includes('validateFields')) return
      message.error((e as { message?: string })?.message ?? 'Gagal')
    } finally {
      setGeneratorSaving(false)
    }
  }

  const generateApiUrl = (plannerId: string) =>
    `/api/companies/${companyData.id}/content-planner/${plannerId}/generate`

  const handleGenerateAI = async (record: ContentPlannerRecord) => {
    setGenerateLoadingId(record.id)
    try {
      const res = await fetch(generateApiUrl(record.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(data?.error ?? 'Failed to generate content')
        return
      }
      message.success('Content generated')
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to generate')
    } finally {
      setGenerateLoadingId(null)
    }
  }

  const handleReview = (record: ContentPlannerRecord) => {
    const url = basePath
      ? `${basePath}/content-planner/${record.id}`
      : `/companies/${companyData.id}/content-planner/${record.id}`
    router.push(url)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const ctaDynamic = !!values.cta_dynamic
      const payload = {
        company_id: companyData.id,
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
        status: values.status || 'draft',
        insight: values.insight?.trim() || null,
      }

      setSaving(true)
      const { error } = await supabase.from('company_content_planners').insert(payload)
      if (error) throw error
      message.success('Content planner created')
      setModalVisible(false)
      form.resetFields()
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      if (err?.message && !String(err.message).includes('validateFields')) {
        message.error(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<ContentPlannerRecord> = [
    {
      title: 'Topic',
      dataIndex: 'topic',
      key: 'topic',
      ellipsis: true,
      render: (v: string) => v || '—',
    },
    {
      title: 'Channel',
      key: 'channel',
      width: 120,
      render: (_, r) => r.channel?.title ?? '—',
    },
    {
      title: 'Format',
      key: 'format',
      width: 120,
      render: (_, r) => r.format?.title ?? '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: string) => {
        const colors: Record<string, string> = {
          planned: 'default',
          draft: 'blue',
          ai_generated: 'cyan',
          human_reviewed: 'orange',
          approved: 'green',
          published: 'success',
          needs_update: 'warning',
        }
        return <Tag color={colors[s] || 'default'}>{s?.replace(/_/g, ' ') || '—'}</Tag>
      },
    },
    {
      title: 'Publish Date',
      dataIndex: 'publish_date',
      key: 'publish_date',
      width: 110,
      render: (d: string | null) => (d ? <DateDisplay date={d} /> : '—'),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (d: string) => <DateDisplay date={d} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleReview(record)}>
            Review
          </Button>
          {record.status === 'draft' && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              loading={generateLoadingId === record.id}
              onClick={() => handleGenerateAI(record)}
            >
              Generate AI
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const renderForm = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
      <Form.Item style={{ marginBottom: 0 }}>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            Create
          </Button>
          <Button onClick={() => { setModalVisible(false); form.resetFields() }}>
            Cancel
          </Button>
        </Space>
      </Form.Item>
    </Form>
  )

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong>Content Planner</Text>
        <Space>
          <Button icon={<PlusOutlined />} onClick={handleOpenGenerator}>
            Generate Planners
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add Content
          </Button>
        </Space>
      </div>
      <Spin spinning={loading}>
        <Table
          size="small"
          columns={columns}
          dataSource={planners}
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} items` }}
          locale={{ emptyText: 'No content planners yet' }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => handleReview(record),
          })}
        />
      </Spin>

      <Modal
        title="Create Content Planner"
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields() }}
        footer={null}
        width={700}
        destroyOnClose
      >
        {renderForm()}
      </Modal>

      <Modal
        title="Generate Planners"
        open={generatorModalVisible}
        onCancel={() => { setGeneratorModalVisible(false); generatorForm.resetFields() }}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form form={generatorForm} layout="vertical" onFinish={handleGeneratorSubmit}>
          <Form.Item name="gbp_per_week" label="GBP per week" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="social_per_week" label="Social per week" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="blogs_per_week" label="Blogs per week" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="preferred_post_days" label="Preferred post days" initialValue="Mon, Fri">
            <Input placeholder="e.g. Mon, Fri" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={generatorSaving}>
                Generate
              </Button>
              <Button onClick={() => { setGeneratorModalVisible(false); generatorForm.resetFields() }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
