'use client'

import { CloudDownloadOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import DateDisplay from '../DateDisplay'

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
  /** When set (e.g. /customer), links go to basePath/content-planner/[id]; else /settings/companies/[id]/content-planner/[id] */
  basePath?: string
}

interface ContentPlannerRecord {
  id: string
  company_id: string
  channel_id: string | null
  topic: string | null
  topic_description: string | null
  topic_type_id: string | null
  hashtags: string | null
  primary_keyword: string | null
  secondary_keywords: string | null
  intents: string[]
  location: string | null
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
  topic_type?: { id: string; title: string } | null
}

export default function TabContentPlanner({ companyData, basePath }: TabContentPlannerProps) {
  const router = useRouter()
  const [planners, setPlanners] = useState<ContentPlannerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [intents, setIntents] = useState<{ id: string; title: string }[]>([])
  const [topicTypes, setTopicTypes] = useState<{ id: string; title: string }[]>([])
  const [channels, setChannels] = useState<{ id: string; title: string; company_ai_system_template_id?: string | null }[]>([])
  const [aiTemplates, setAiTemplates] = useState<{ id: string; title: string }[]>([])
  const [channelDefaultsVisible, setChannelDefaultsVisible] = useState(false)
  const [updatingChannelTemplate, setUpdatingChannelTemplate] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [generatorModalVisible, setGeneratorModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatorSaving, setGeneratorSaving] = useState(false)
  const [generateLoadingId, setGenerateLoadingId] = useState<string | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [form] = Form.useForm()
  const [generatorForm] = Form.useForm()

  // Import from Sheet: accept Google Sheets URL or OpenSheet URL
  const [importSheetVisible, setImportSheetVisible] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetNumber, setSheetNumber] = useState(1) // tab number (1 = first sheet)
  const [sheetData, setSheetData] = useState<Record<string, unknown>[]>([])
  const [sheetColumns, setSheetColumns] = useState<string[]>([])
  const [fetchingSheet, setFetchingSheet] = useState(false)
  const [importingSheet, setImportingSheet] = useState(false)
  const [importMapping, setImportMapping] = useState<Record<string, string>>({
    topic: '',
    topic_description: '',
    channel: '',
    topic_type: '',
    hashtags: '',
    insight: '',
  })

  /** Convert pasted URL to OpenSheet URL. Accepts:
   * - Google Sheets: https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit?gid=...
   * - OpenSheet: https://opensheet.elk.sh/{spreadsheetId}/{sheetNumber}
   */
  const normalizeToOpenSheetUrl = (pasted: string, tabNum: number): string | null => {
    const trimmed = pasted.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('https://opensheet.elk.sh/')) return trimmed
    const match = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (match) {
      const spreadsheetId = match[1]
      const sheet = tabNum >= 1 ? tabNum : 1
      return `https://opensheet.elk.sh/${spreadsheetId}/${sheet}`
    }
    return null
  }

  const fetchPlanners = async () => {
    if (!companyData?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyData.id}/content-planner`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
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
      const res = await fetch('/api/content-planner/lookup', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setIntents(data.intents || [])
      setTopicTypes(data.topicTypes || [])
      setChannels(data.channels || [])
      setAiTemplates(data.aiTemplates || [])
    } catch {
      // ignore
    }
  }

  const handleChannelTemplateChange = async (channelId: string, templateId: string | null) => {
    setUpdatingChannelTemplate(channelId)
    try {
      const res = await fetch(`/api/content-planner/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ company_ai_system_template_id: templateId }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed to update')
      message.success('Default template updated')
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, company_ai_system_template_id: templateId || null } : c
        )
      )
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to update')
    } finally {
      setUpdatingChannelTemplate(null)
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
        message.error('At least one of GBP, Social, or Blogs must be greater than 0')
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
        message.error(data?.error ?? 'Failed to generate planners')
        return
      }
      message.success(`${data.created ?? 0} content planner(s) created`)
      setGeneratorModalVisible(false)
      fetchPlanners()
    } catch (e: unknown) {
      if (String((e as { message?: string })?.message || '').includes('validateFields')) return
      message.error((e as { message?: string })?.message ?? 'Failed')
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

  const handleRegenerateAI = async (record: ContentPlannerRecord) => {
    setGenerateLoadingId(record.id)
    try {
      const res = await fetch(generateApiUrl(record.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(data?.error ?? 'Failed to regenerate content')
        return
      }
      message.success('Content regenerated')
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to regenerate')
    } finally {
      setGenerateLoadingId(null)
    }
  }

  const handleDelete = async (record: ContentPlannerRecord, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const res = await fetch(`/api/companies/${companyData.id}/content-planner/${record.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed to delete')
      message.success('Deleted')
      setSelectedRowKeys((prev) => prev.filter((k) => k !== record.id))
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to delete')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) return
    setBulkDeleting(true)
    try {
      const ids = selectedRowKeys.map(String).join(',')
      const res = await fetch(`/api/companies/${companyData.id}/content-planner?ids=${encodeURIComponent(ids)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Bulk delete failed')
      message.success(`Deleted ${selectedRowKeys.length} item(s)`)
      setSelectedRowKeys([])
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  const generateImageApiUrl = (plannerId: string) =>
    `/api/companies/${companyData.id}/content-planner/${plannerId}/generate-image`

  const handleBulkGenerateAI = async (mode: 'content_only' | 'content_and_image') => {
    if (selectedRowKeys.length === 0) return
    setBulkGenerating(true)
    let generated = 0
    let imagesGenerated = 0
    try {
      for (const id of selectedRowKeys) {
        const res = await fetch(generateApiUrl(String(id)), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          message.warning(`Planner ${id}: ${data?.error ?? 'Generate failed'}`)
          continue
        }
        generated++
        if (mode === 'content_and_image' && data?.result?.output_json?.image_prompt) {
          const imgRes = await fetch(generateImageApiUrl(String(id)), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          })
          if (imgRes.ok) imagesGenerated++
        }
      }
      if (generated > 0) {
        message.success(
          mode === 'content_and_image' && imagesGenerated > 0
            ? `${generated} content generated, ${imagesGenerated} image(s) generated`
            : `${generated} content generated`
        )
      }
      setSelectedRowKeys([])
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Bulk generate failed')
    } finally {
      setBulkGenerating(false)
    }
  }

  const handleReview = (record: ContentPlannerRecord) => {
    const url = basePath
      ? `${basePath}/content-planner/${record.id}`
      : `/settings/companies/${companyData.id}/content-planner/${record.id}`
    router.push(url)
  }

  const handleOpenImportSheet = () => {
    setSheetUrl('')
    setSheetNumber(1)
    setSheetData([])
    setSheetColumns([])
    setImportMapping({
      topic: '',
      topic_description: '',
      channel: '',
      topic_type: '',
      hashtags: '',
      insight: '',
    })
    setImportSheetVisible(true)
  }

  const handleFetchSheet = async () => {
    const urlToFetch = normalizeToOpenSheetUrl(sheetUrl, sheetNumber)
    if (!urlToFetch) {
      message.warning('Paste Google Sheets link (docs.google.com/spreadsheets/d/...) or OpenSheet URL')
      return
    }
    setFetchingSheet(true)
    try {
      const res = await fetch(
        `/api/companies/${companyData.id}/content-planner/fetch-sheet?url=${encodeURIComponent(urlToFetch)}`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(data?.error ?? 'Failed to fetch sheet')
        return
      }
      const rows = Array.isArray(data) ? data : []
      setSheetData(rows)
      const cols = rows.length > 0 ? Object.keys(rows[0] as object) : []
      setSheetColumns(cols)
      if (cols.length > 0) {
        message.success(`Fetched ${rows.length} rows, ${cols.length} columns. Map columns below.`)
      } else {
        message.warning('Sheet has no rows or columns')
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Failed to fetch sheet')
    } finally {
      setFetchingSheet(false)
    }
  }

  const getCellValue = (row: Record<string, unknown>, colKey: string): string => {
    if (!colKey) return ''
    const v = row[colKey]
    if (v === null || v === undefined) return ''
    return String(v).trim()
  }

  /** Resolve channel id by title; if not found, create channel in DB and return new id (so import never leaves channel null). */
  const resolveChannelIdByTitleOrCreate = async (title: string, cache: Record<string, string>): Promise<string | null> => {
    if (!title?.trim()) return null
    const key = title.trim().toLowerCase()
    const displayTitle = title.trim()
    if (cache[key]) return cache[key]
    const found = channels.find((c) => c.title.trim().toLowerCase() === key)
    if (found) {
      cache[key] = found.id
      return found.id
    }
    const res = await fetch('/api/content-planner/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: displayTitle }),
    })
    const data = await res.json().catch(() => ({})) as { id?: string; title?: string }
    if (data?.id) {
      cache[key] = data.id
      setChannels((prev) => [...prev, { id: data.id!, title: displayTitle, company_ai_system_template_id: null }])
      return data.id
    }
    if (!res.ok) {
      const err = (data as { error?: string })?.error ?? 'Failed to create channel'
      console.error('Failed to create channel:', displayTitle, err)
      message.warning(`Channel "${displayTitle}" could not be created: ${err}`)
    }
    return null
  }

  const resolveTopicTypeIdByTitle = (title: string): string | null => {
    if (!title) return null
    const t = title.trim().toLowerCase()
    const found = topicTypes.find((tp) => tp.title.trim().toLowerCase() === t)
    return found?.id ?? null
  }

  const handleImportFromSheet = async () => {
    const topicCol = importMapping.topic?.trim()
    if (!topicCol && sheetData.length > 0) {
      message.warning('Map at least "Topic" column (e.g. Post Title) to import')
      return
    }
    setImportingSheet(true)
    try {
      const channelCache: Record<string, string> = {}
      for (const c of channels) channelCache[c.title.trim().toLowerCase()] = c.id
      const initialCacheKeys = Object.keys(channelCache).length

      let created = 0
      for (const row of sheetData) {
        const topic = topicCol ? getCellValue(row, topicCol) : ''
        const topicDescription = importMapping.topic_description ? getCellValue(row, importMapping.topic_description) : null
        const channelTitle = importMapping.channel ? getCellValue(row, importMapping.channel) : ''
        const topicTypeTitle = importMapping.topic_type ? getCellValue(row, importMapping.topic_type) : ''
        const hashtags = importMapping.hashtags ? getCellValue(row, importMapping.hashtags) : null
        const insightParts: string[] = []
        if (importMapping.insight) {
          const v = getCellValue(row, importMapping.insight)
          if (v) insightParts.push(v)
        }
        const insight = insightParts.length > 0 ? insightParts.join('\n') : null

        const channel_id = await resolveChannelIdByTitleOrCreate(channelTitle, channelCache)
        const topic_type_id = resolveTopicTypeIdByTitle(topicTypeTitle)

        const payload = {
          company_id: companyData.id,
          channel_id,
          topic: topic || null,
          topic_description: topicDescription || null,
          topic_type_id,
          hashtags: hashtags || null,
          primary_keyword: null,
          secondary_keywords: null,
          intents: [],
          location: null,
          cta_dynamic: true,
          cta_type: null,
          cta_text: null,
          publish_date: null,
          status: 'draft',
          insight,
        }

        const res = await fetch(`/api/companies/${companyData.id}/content-planner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (res.ok) created++
      }
      const newChannelsCount = Object.keys(channelCache).length - initialCacheKeys
      if (newChannelsCount > 0) {
        message.success(
          `${created} content planner(s) imported. ${newChannelsCount} new channel(s) were added automatically.`
        )
      } else {
        message.success(`${created} content planner(s) imported`)
      }
      setImportSheetVisible(false)
      fetchPlanners()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message ?? 'Import failed')
    } finally {
      setImportingSheet(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const ctaDynamic = !!values.cta_dynamic
      const payload = {
        company_id: companyData.id,
        channel_id: values.channel_id || null,
        topic: values.topic?.trim() || null,
        topic_description: values.topic_description?.trim() || null,
        topic_type_id: values.topic_type_id || null,
        hashtags: values.hashtags?.trim() || null,
        primary_keyword: values.primary_keyword?.trim() || null,
        secondary_keywords: values.secondary_keywords?.trim() || null,
        intents: Array.isArray(values.intents) ? values.intents : [],
        location: values.location?.trim() || null,
        cta_dynamic: ctaDynamic,
        cta_type: ctaDynamic ? null : (values.cta_type || null),
        cta_text: ctaDynamic ? null : (values.cta_text?.trim() || null),
        publish_date: values.publish_date ? values.publish_date.format('YYYY-MM-DD') : null,
        status: values.status || 'draft',
        insight: values.insight?.trim() || null,
      }

      setSaving(true)
      const res = await fetch(`/api/companies/${companyData.id}/content-planner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string })?.error ?? 'Failed to create')
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
      title: 'Topic Type',
      key: 'topic_type',
      width: 120,
      render: (_, r) => r.topic_type?.title ?? '—',
    },
    {
      title: 'Hashtags',
      dataIndex: 'hashtags',
      key: 'hashtags',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => (v ? String(v).slice(0, 40) + (String(v).length > 40 ? '…' : '') : '—'),
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
      width: 260,
      render: (_, record) => (
        <Space onClick={(e) => e.stopPropagation()} wrap>
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
          {(record.ai_content_results?.content_text != null || record.ai_content_results?.output_json != null) && (
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              loading={generateLoadingId === record.id}
              onClick={() => handleRegenerateAI(record)}
            >
              Regenerate AI
            </Button>
          )}
          <Popconfirm
            title="Delete this content planner?"
            onConfirm={(e) => handleDelete(record, e)}
            onCancel={(e) => e?.stopPropagation()}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            >
              Delete
            </Button>
          </Popconfirm>
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
          <Form.Item name="topic_type_id" label="Topic Type">
            <Select placeholder="Select topic type" allowClear>
              {topicTypes.map((t) => (
                <Option key={t.id} value={t.id}>{t.title}</Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="topic_description" label="Topic Description">
        <TextArea rows={2} placeholder="Describe the topic or content focus" />
      </Form.Item>
      <Form.Item name="hashtags" label="Hashtags">
        <Input placeholder="e.g. #marketing #seo (comma or space separated)" />
      </Form.Item>
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
          <Button onClick={() => setChannelDefaultsVisible(true)}>
            Default AI template per channel
          </Button>
          <Button icon={<CloudDownloadOutlined />} onClick={handleOpenImportSheet}>
            Import from Sheet
          </Button>
          <Button icon={<PlusOutlined />} onClick={handleOpenGenerator}>
            Generate Planners
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add Content
          </Button>
        </Space>
      </div>
      {selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <Text type="secondary">{selectedRowKeys.length} selected</Text>
          <Popconfirm
            title={`Delete ${selectedRowKeys.length} item(s)?`}
            onConfirm={handleBulkDelete}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} loading={bulkDeleting}>
              Bulk delete
            </Button>
          </Popconfirm>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'content_only',
                  label: 'Content only',
                  onClick: () => handleBulkGenerateAI('content_only'),
                },
                {
                  key: 'content_and_image',
                  label: 'Content + image (when image_prompt exists)',
                  onClick: () => handleBulkGenerateAI('content_and_image'),
                },
              ],
            }}
          >
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={bulkGenerating}
              disabled={bulkGenerating}
            >
              Bulk generate AI
            </Button>
          </Dropdown>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>
            Clear selection
          </Button>
        </Space>
      )}
      <Spin spinning={loading}>
        <Table
          size="small"
          columns={columns}
          dataSource={planners}
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as React.Key[]),
          }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} items` }}
          locale={{ emptyText: 'No content planners yet' }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: (e) => {
              if ((e.target as HTMLElement).closest('.ant-table-selection-column')) return
              handleReview(record)
            },
          })}
        />
      </Spin>

      <Modal
        title="Create Content Planner"
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields() }}
        footer={null}
        width={700}
      >
        {renderForm()}
      </Modal>

      <Modal
        title="Import from Sheet"
        open={importSheetVisible}
        onCancel={() => setImportSheetVisible(false)}
        footer={null}
        width={720}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">
            Paste a Google Sheets link (docs.google.com/spreadsheets/d/...) or an OpenSheet URL. The spreadsheet ID is used to fetch data via opensheet.elk.sh.
          </Text>
          <Input
            placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=... or https://opensheet.elk.sh/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            addonAfter={
              <Button type="link" size="small" loading={fetchingSheet} onClick={handleFetchSheet}>
                Fetch
              </Button>
            }
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Tab / sheet index (1 = first):
            </Text>
            <InputNumber
              min={1}
              value={sheetNumber}
              onChange={(v) => setSheetNumber(typeof v === 'number' ? v : 1)}
              style={{ width: 72 }}
            />
          </div>
          {sheetColumns.length > 0 && (
            <>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Map sheet columns to Content Planner fields</Text>
                <Row gutter={[16, 8]}>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Topic (e.g. Post Title)</Text>
                    <Select
                      placeholder="Don't map"
                      allowClear
                      style={{ width: '100%' }}
                      value={importMapping.topic || undefined}
                      onChange={(v) => setImportMapping((m) => ({ ...m, topic: v ?? '' }))}
                    >
                      {sheetColumns.map((c) => (
                        <Option key={c} value={c}>{c}</Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Topic Description (e.g. Content Description)</Text>
                    <Select
                      placeholder="Don't map"
                      allowClear
                      style={{ width: '100%' }}
                      value={importMapping.topic_description || undefined}
                      onChange={(v) => setImportMapping((m) => ({ ...m, topic_description: v ?? '' }))}
                    >
                      {sheetColumns.map((c) => (
                        <Option key={c} value={c}>{c}</Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Channel (e.g. Platform) — match by title</Text>
                    <Select
                      placeholder="Don't map"
                      allowClear
                      style={{ width: '100%' }}
                      value={importMapping.channel || undefined}
                      onChange={(v) => setImportMapping((m) => ({ ...m, channel: v ?? '' }))}
                    >
                      {sheetColumns.map((c) => (
                        <Option key={c} value={c}>{c}</Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Topic Type (e.g. Post Type) — match by title</Text>
                    <Select
                      placeholder="Don't map"
                      allowClear
                      style={{ width: '100%' }}
                      value={importMapping.topic_type || undefined}
                      onChange={(v) => setImportMapping((m) => ({ ...m, topic_type: v ?? '' }))}
                    >
                      {sheetColumns.map((c) => (
                        <Option key={c} value={c}>{c}</Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Hashtags</Text>
                    <Select
                      placeholder="Don't map"
                      allowClear
                      style={{ width: '100%' }}
                      value={importMapping.hashtags || undefined}
                      onChange={(v) => setImportMapping((m) => ({ ...m, hashtags: v ?? '' }))}
                    >
                      {sheetColumns.map((c) => (
                        <Option key={c} value={c}>{c}</Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Insight / extra (e.g. Week, Division)</Text>
                    <Select
                      placeholder="Don't map"
                      allowClear
                      style={{ width: '100%' }}
                      value={importMapping.insight || undefined}
                      onChange={(v) => setImportMapping((m) => ({ ...m, insight: v ?? '' }))}
                    >
                      {sheetColumns.map((c) => (
                        <Option key={c} value={c}>{c}</Option>
                      ))}
                    </Select>
                  </Col>
                </Row>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Preview (first 5 rows)</Text>
                <Table
                  size="small"
                  dataSource={sheetData.slice(0, 5)}
                  columns={sheetColumns.map((c) => ({
                    title: c,
                    dataIndex: c,
                    key: c,
                    ellipsis: true,
                    render: (v: unknown) => (v != null ? String(v).slice(0, 50) + (String(v).length > 50 ? '…' : '') : '—'),
                  }))}
                  pagination={false}
                  rowKey={(_, i) => String(i)}
                />
              </div>
              <Space>
                <Button
                  type="primary"
                  loading={importingSheet}
                  onClick={handleImportFromSheet}
                  disabled={!importMapping.topic?.trim()}
                >
                  Import {sheetData.length} row(s)
                </Button>
                <Button onClick={() => setImportSheetVisible(false)}>Cancel</Button>
              </Space>
            </>
          )}
        </Space>
      </Modal>

      <Modal
        title="Default AI template per channel"
        open={channelDefaultsVisible}
        onCancel={() => setChannelDefaultsVisible(false)}
        footer={null}
        width={560}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Set a default AI system template per channel. When you generate content, this template is used automatically if the planner row uses that channel.
        </Text>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          {channels.map((ch) => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Text strong style={{ minWidth: 180 }}>{ch.title}</Text>
              <Select
                placeholder="No default"
                allowClear
                style={{ flex: 1, minWidth: 200 }}
                value={ch.company_ai_system_template_id || null}
                onChange={(v) => handleChannelTemplateChange(ch.id, v ?? null)}
                loading={updatingChannelTemplate === ch.id}
                options={aiTemplates.map((t) => ({ value: t.id, label: t.title }))}
              />
            </div>
          ))}
          {channels.length === 0 && (
            <Text type="secondary">No channels yet. Create channels via Import from Sheet or Add Content.</Text>
          )}
        </Space>
      </Modal>

      <Modal
        title="Generate Planners"
        open={generatorModalVisible}
        onCancel={() => { setGeneratorModalVisible(false); generatorForm.resetFields() }}
        footer={null}
        width={480}
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
