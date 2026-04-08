'use client'

import { Layout, Card, Descriptions, Tag, Typography, Button, Space, Row, Col, Divider, Tabs, Form, Input, message, Spin, Select, Table, Popconfirm, Switch, Modal, Progress, Flex } from 'antd'
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, TeamOutlined, DatabaseOutlined, SaveOutlined, FileTextOutlined, PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined, PlayCircleOutlined, EyeOutlined, ReadOutlined, CloudUploadOutlined, HistoryOutlined, CheckSquareOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import CustomerNavbar from './CustomerNavbar'
import DateDisplay from './DateDisplay'
import {
  TabInfo,
  TabUsers,
  TabDataForm,
  TabGenerate,
  TabKnowledgeBase,
  TabWebsites,
  TabCrawling,
  TabTickets,
  TabContentPlanner,
} from './CompanyDetail'

/** Temporary: company KB API errors on load — set true to restore tab + fetches */
const COMPANY_DETAIL_KNOWLEDGE_BASE_ENABLED = false

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

function ColorPickerInput({
  value,
  onChange,
}: {
  value?: string
  onChange?: (v: string) => void
}) {
  const hex = value || '#000000'
  return (
    <Space align="center">
      <Input
        type="color"
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }}
      />
      <Input
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#000000"
        style={{ width: 120 }}
      />
    </Space>
  )
}

interface CompanyDetailContentProps {
  user: { id: string; email?: string | null; name?: string | null }
  companyData: any
  /** 'customer' = navbar layout for customer portal; 'admin' = sidebar layout (default) */
  variant?: 'admin' | 'customer'
  /** When set, render only this section (no tabs). Keys: info, users, tickets, content-planner, data-form, generate, knowledge-base, websites, crawling */
  activeSection?: string
  /** Used to show portal-admin toggle on Users tab (system admin only) */
  currentUserRole?: string | null
}

export default function CompanyDetailContent({
  user: currentUser,
  companyData,
  variant = 'admin',
  activeSection,
  currentUserRole,
}: CompanyDetailContentProps) {
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
  const [usedFieldsInGenerated, setUsedFieldsInGenerated] = useState<string[]>([])
  const [usedSourceIdsFromCompanyDatas, setUsedSourceIdsFromCompanyDatas] = useState<string[]>([])
  const [savingToKb, setSavingToKb] = useState(false)
  const [websites, setWebsites] = useState<any[]>([])
  const [loadingWebsites, setLoadingWebsites] = useState(false)
  const [websiteModalVisible, setWebsiteModalVisible] = useState(false)
  const [editingWebsite, setEditingWebsite] = useState<any>(null)
  const [websiteForm] = Form.useForm()
  const [crawlSessions, setCrawlSessions] = useState<any[]>([])
  const [loadingCrawlSessions, setLoadingCrawlSessions] = useState(false)
  const [crawlModalVisible, setCrawlModalVisible] = useState(false)
  const [crawlForm] = Form.useForm()
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([])
  const [loadingKnowledgeBases, setLoadingKnowledgeBases] = useState(false)
  const [kbPreviewVisible, setKbPreviewVisible] = useState(false)
  const [kbPreviewContent, setKbPreviewContent] = useState('')
  const [kbPreviewTitle, setKbPreviewTitle] = useState('')
  const [embeddingLoadingId, setEmbeddingLoadingId] = useState<string | null>(null)
  const [aiSystemTemplates, setAiSystemTemplates] = useState<{ id: string; title: string }[]>([])
  const [loadingAiSystemTemplates, setLoadingAiSystemTemplates] = useState(false)
  const [ragTemplateId, setRagTemplateId] = useState<string | null>(null)
  const [ragPrompt, setRagPrompt] = useState('')
  const [ragLoading, setRagLoading] = useState(false)
  const [ragResult, setRagResult] = useState<Record<string, unknown> | null>(null)
  const [ragErrorFull, setRagErrorFull] = useState<string>('')
  const [generationHistory, setGenerationHistory] = useState<any[]>([])
  const [loadingGenerationHistory, setLoadingGenerationHistory] = useState(false)
  const [historyPreviewVisible, setHistoryPreviewVisible] = useState(false)
  const [historyPreviewContent, setHistoryPreviewContent] = useState('')
  const [historyPreviewPrompt, setHistoryPreviewPrompt] = useState('')
  const [generationHistoryError, setGenerationHistoryError] = useState<string>('')
  const [companyEditModalOpen, setCompanyEditModalOpen] = useState(false)
  const [companyEditLoading, setCompanyEditLoading] = useState(false)
  const [companyEditForm] = Form.useForm()

  async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...options, credentials: 'include' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || res.statusText || 'Request failed')
    }
    return res.json()
  }

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

  const openEditCompanyModal = () => {
    companyEditForm.setFieldsValue({
      name: companyData.name,
      email: companyData.email || '',
      is_active: companyData.is_active ?? true,
      color: companyData.color || '#000000',
    })
    setCompanyEditModalOpen(true)
  }

  const handleSaveCompany = async () => {
    try {
      const values = await companyEditForm.validateFields()
      const name = (values.name ?? '').trim()
      if (!name) {
        message.warning('Company name is required')
        return
      }
      const color = (values.color || '#000000').trim() || '#000000'
      setCompanyEditLoading(true)
      const email = (values.email ?? '').trim() || null
      await apiFetch(`/api/companies/${companyData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, is_active: !!values.is_active, color }),
      })
      message.success('Company updated')
      setCompanyEditModalOpen(false)
      router.refresh()
    } catch (e: unknown) {
      const err = e as { message?: string }
      if (err?.message && !String(err.message).includes('validateFields')) {
        message.error(err?.message || 'Failed to update company')
      }
    } finally {
      setCompanyEditLoading(false)
    }
  }

  const handleCrawlDelete = async (crawlSessionId: string) => {
    try {
      await apiFetch(`/api/crawl-sessions/${crawlSessionId}`, { method: 'DELETE' })
      message.success('Crawl session deleted successfully')
      fetchCrawlSessions()
    } catch (error: any) {
      message.error('Failed to delete crawl session')
      console.error('Error deleting crawl session:', error)
    } finally {
      setLoadingCrawlSessions(false)
    }
  }

  const fetchKnowledgeBases = async () => {
    if (!companyData?.id) return
    setLoadingKnowledgeBases(true)
    try {
      const list = await apiFetch<any[]>(`/api/companies/${companyData.id}/knowledge-bases`)
      setKnowledgeBases(list || [])
    } catch (error: any) {
      message.error('Failed to load knowledge base')
    } finally {
      setLoadingKnowledgeBases(false)
    }
  }

  const fetchAiSystemTemplates = async () => {
    setLoadingAiSystemTemplates(true)
    try {
      const data = await apiFetch<{ id: string; title: string }[]>('/api/company-ai-system-templates')
      setAiSystemTemplates(data ?? [])
    } catch (error: any) {
      message.error('Failed to load AI system templates')
    } finally {
      setLoadingAiSystemTemplates(false)
    }
  }

  const fetchGenerationHistory = async () => {
    if (!companyData?.id) return
    setLoadingGenerationHistory(true)
    setGenerationHistoryError('')
    try {
      const data = await apiFetch<any[]>(`/api/companies/${companyData.id}/generation-history`)
      setGenerationHistory(data ?? [])
    } catch (error: any) {
      setGenerationHistoryError(error?.message || '')
      message.error('Failed to load generation history')
    } finally {
      setLoadingGenerationHistory(false)
    }
  }

  useEffect(() => {
    fetchDataTemplates()
    fetchContentTemplates()
    fetchWebsites()
    if (COMPANY_DETAIL_KNOWLEDGE_BASE_ENABLED) {
      fetchAiSystemTemplates()
      fetchKnowledgeBases()
      fetchGenerationHistory()
    }
  }, [companyData?.id])

  useEffect(() => {
    if (websites.length > 0) {
      fetchCrawlSessions()
    }
  }, [websites])

  // Create map of last crawl session per website
  const getLastCrawlSession = (websiteId: string) => {
    return crawlSessions.find(session => session.company_website_id === websiteId)
  }

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
      const res = await apiFetch<{ data: any[] }>('/api/company-data-templates?is_active=true')
      const data = res?.data || []
      setDataTemplates(data)
      
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
      const res = await apiFetch<{ data: any[] }>('/api/company-content-templates')
      const data = res?.data || []
      setContentTemplates(data)
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
      const res = await apiFetch<{ data: any[] }>(`/api/company-websites?company_id=${companyData.id}`)
      setWebsites(res?.data || [])
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
      if (!companyData?.id) {
        setCrawlSessions([])
        setLoadingCrawlSessions(false)
        return
      }
      const data = await apiFetch<any[]>(`/api/companies/${companyData.id}/crawl-sessions`)
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
      setUsedFieldsInGenerated([])
      setUsedSourceIdsFromCompanyDatas([])
      return
    }

    // Find the selected content template
    const contentTemplate = contentTemplates.find((t) => t.id === selectedContentTemplate)
    if (!contentTemplate || !contentTemplate.content) {
      setGeneratedContent('')
      setUsedFieldsInGenerated([])
      setUsedSourceIdsFromCompanyDatas([])
      return
    }

    // Create multiple maps for different lookup methods
    const dataMapById: { [key: string]: string } = {}
    const dataMapByTitle: { [key: string]: string } = {}
    const templateIdToTitle: { [key: string]: string } = {}
    // templateId -> company_datas.id (for source_ids)
    const dataTemplateIdToCompanyDataId: { [key: string]: string } = {}

    // Build template ID to title map first
    dataTemplates.forEach((template: any) => {
      if (template.id && template.title) {
        templateIdToTitle[template.id] = template.title.toLowerCase().replace(/\s+/g, '')
      }
    })

    // Build data maps from company_datas (and map templateId -> company_datas.id)
    if (companyData.company_datas) {
      companyData.company_datas.forEach((item: any) => {
        const templateId = item.data_template_id || item.company_data_templates?.id
        const value = item.value || ''
        const companyDataId = item.id

        if (templateId && companyDataId) {
          dataMapById[templateId] = value
          dataTemplateIdToCompanyDataId[templateId] = companyDataId

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
    const usedPlaceholders: string[] = []

    generated = generated.replace(placeholderRegex, (match: string, placeholder: string) => {
      const key = placeholder.trim()
      if (key && !usedPlaceholders.includes(key)) {
        usedPlaceholders.push(key)
      }
      const normalizedPlaceholder = key.toLowerCase().replace(/\s+/g, '')

      // Try to find value by:
      // 1. Exact ID match (original format - e.g., {{uuid-123}})
      let value = dataMapById[key]

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

    // Resolve used placeholders to company_datas IDs for source_ids
    const sourceIds: string[] = []
    const seenIds = new Set<string>()
    usedPlaceholders.forEach((key) => {
      const normalizedPlaceholder = key.toLowerCase().replace(/\s+/g, '')
      let templateId: string | undefined
      if (dataMapById[key]) {
        templateId = key
      } else if (dataMapByTitle[normalizedPlaceholder]) {
        const matchingTemplate = dataTemplates.find((t: any) => {
          const norm = (t.title || '').toLowerCase().replace(/\s+/g, '')
          return norm === normalizedPlaceholder
        })
        templateId = matchingTemplate?.id
      }
      const companyDataId = templateId ? dataTemplateIdToCompanyDataId[templateId] : undefined
      if (companyDataId && !seenIds.has(companyDataId)) {
        seenIds.add(companyDataId)
        sourceIds.push(companyDataId)
      }
    })

    setGeneratedContent(generated)
    setUsedFieldsInGenerated(usedPlaceholders)
    setUsedSourceIdsFromCompanyDatas(sourceIds)
  }

  const handleSaveToKnowledgeBase = async () => {
    if (!generatedContent || !companyData?.id || !selectedContentTemplate) {
      message.warning('Generate content first and select a template')
      return
    }
    setSavingToKb(true)
    try {
      const contentTemplate = contentTemplates.find((t) => t.id === selectedContentTemplate)
      const templateType = contentTemplate?.type ?? contentTemplate?.type ?? 'generated'

      await apiFetch(`/api/companies/${companyData.id}/knowledge-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: templateType,
          content: generatedContent,
          content_template_id: selectedContentTemplate,
          source_ids: usedSourceIdsFromCompanyDatas.length > 0 ? usedSourceIdsFromCompanyDatas : null,
        }),
      })
      message.success('Saved to Knowledge Base')
      fetchKnowledgeBases()
    } catch (error: any) {
      message.error(error?.message ?? 'Failed to save to Knowledge Base')
    } finally {
      setSavingToKb(false)
    }
  }

  const handleKbPreview = (record: any) => {
    setKbPreviewTitle(record.company_content_templates?.title || record.type || 'Content')
    setKbPreviewContent(record.content || '')
    setKbPreviewVisible(true)
  }

  const handleDeleteKb = async (id: string) => {
    try {
      await apiFetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' })
      message.success('Removed from Knowledge Base')
      fetchKnowledgeBases()
    } catch (error: any) {
      message.error(error?.message ?? 'Failed to delete')
    }
  }

  const handleAddToOpenAI = async (record: any) => {
    if (!record.content?.trim()) {
      message.warning('No content to embed')
      return
    }
    setEmbeddingLoadingId(record.id)
    try {
      const res = await fetch(`/api/knowledge-bases/${record.id}/embed`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(data?.error ?? 'Failed to add to OpenAI')
        return
      }
      message.success('Embedding saved to OpenAI / Knowledge Base')
      fetchKnowledgeBases()
    } catch (error: any) {
      message.error(error?.message ?? 'Failed to add to OpenAI')
    } finally {
      setEmbeddingLoadingId(null)
    }
  }

  const handleGenerateFromKb = async () => {
    if (!ragTemplateId) {
      message.warning('Select an AI System Template')
      return
    }
    if (!companyData?.id) return
    setRagLoading(true)
    setRagResult(null)
    setRagErrorFull('')
    try {
      const res = await fetch(`/api/companies/${companyData.id}/generate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: ragTemplateId, prompt: ragPrompt.trim() || undefined }),
      })
      const rawText = await res.text()
      let data: Record<string, unknown> = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        data = { _raw: rawText }
      }
      if (!res.ok) {
        const fullError = [
          `HTTP ${res.status} ${res.statusText}`,
          `URL: ${res.url}`,
          '',
          'Response body:',
          typeof data === 'object' && data !== null
            ? JSON.stringify(data, null, 2)
            : String(rawText),
        ].join('\n')
        setRagErrorFull(fullError)
        message.error(data?.error ? String(data.error) : `Failed to generate content (${res.status})`)
        return
      }
      const result =
        data?.result !== undefined && data?.result !== null && typeof data.result === 'object'
          ? (data.result as Record<string, unknown>)
          : null
      setRagResult(result)
      if (result) {
        message.success('Content generated successfully')
        if (data?.historyError) {
          message.warning('History not saved: ' + (data.historyError as string))
        }
        fetchGenerationHistory()
      }
    } catch (error: any) {
      const fullError = [
        'Exception:',
        error?.message ?? String(error),
        error?.stack ? `\nStack:\n${error.stack}` : '',
      ].join('\n')
      setRagErrorFull(fullError)
      message.error(error?.message ?? 'Failed to generate content')
    } finally {
      setRagLoading(false)
    }
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
      url: '',
      title: '',
      description: '',
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
      // Ensure is_primary is a proper boolean value
      const isPrimary = Boolean(values.is_primary === true || values.is_primary === 'true' || values.is_primary === 1)

      if (editingWebsite) {
        await apiFetch(`/api/company-websites/${editingWebsite.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: values.url,
            title: values.title || null,
            description: values.description || null,
            is_primary: isPrimary,
            company_id: companyData.id,
          }),
        })
        message.success('Website updated successfully')
      } else {
        await apiFetch('/api/company-websites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyData.id,
            url: values.url,
            title: values.title || null,
            description: values.description || null,
            is_primary: isPrimary,
          }),
        })
        message.success('Website created successfully')
      }

      setWebsiteModalVisible(false)
      websiteForm.resetFields()
      setEditingWebsite(null)
      fetchWebsites()
    } catch (error: any) {
      message.error(error.message || 'Failed to save website')
      console.error('Error saving website:', error)
    }
  }

  const handleWebsiteDelete = async (id: string) => {
    try {
      await apiFetch(`/api/company-websites/${id}`, { method: 'DELETE' })
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

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const values = form.getFieldsValue()
      
      console.log('Form values:', values)
      console.log('Company ID:', companyData.id)
      console.log('Data templates:', dataTemplates)
      
      // Create map of existing values for comparison
      const existingDatasMapForComparison = (companyData.company_datas || []).reduce((acc: any, item: any) => {
        const templateId = item.data_template_id || item.company_data_templates?.id
        const value = item.value || ''
        if (templateId) {
          acc[templateId] = value
        }
        return acc
      }, {})
      
      // Prepare data for API - only include data that has changed
      const changedDatas = dataTemplates
        .map((template) => {
          const currentValue = values[`template_${template.id}`] || ''
          const trimmedValue = typeof currentValue === 'string' ? currentValue.trim() : String(currentValue)
          const existingValue = existingDatasMapForComparison[template.id] || ''
          const trimmedExistingValue = typeof existingValue === 'string' ? existingValue.trim() : String(existingValue)
          
          // Only include if value has actually changed
          if (trimmedValue !== trimmedExistingValue) {
            return {
              data_template_id: template.id,
              value: trimmedValue,
            }
          }
          return null
        })
        .filter((item) => item !== null) // Remove null entries (unchanged fields)

      console.log('Changed datas:', changedDatas)
      console.log('Existing datas map:', existingDatasMapForComparison)

      // If no data changed, show message and don't save
      if (changedDatas.length === 0) {
        message.info('No changes detected. Nothing to save.')
        setSaving(false)
        return
      }

      // For fields that changed, filter to only save meaningful changes:
      // - If new value is not empty, save it (new field or update)
      // - If new value is empty but existing had a value, save empty to clear it
      // - Skip if both are empty (empty to empty change - no point saving)
      const datasToSave = changedDatas.filter((item) => {
        const newValue = (item.value || '').trim()
        const existingValue = (existingDatasMapForComparison[item.data_template_id] || '').trim()
        
        // Save if new value is not empty (adding new field or updating existing), 
        // OR if existing had a value but new is empty (clearing existing value)
        const hasNewValue = newValue !== ''
        const wasClearingValue = existingValue !== '' && newValue === ''
        
        return hasNewValue || wasClearingValue
      })
      
      // If no meaningful changes after filtering, show message and don't save
      if (datasToSave.length === 0) {
        message.info('No valid changes to save.')
        setSaving(false)
        return
      }

      // Ensure companyData.id exists
      if (!companyData.id) {
        throw new Error('Company ID is missing')
      }

      await apiFetch(`/api/companies/${companyData.id}/company-datas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datas: datasToSave }),
      })

      message.success(`${datasToSave.length} data field(s) saved successfully`)
      
      // Refresh the page to show updated data
      router.refresh()
    } catch (error: any) {
      message.error(error.message || 'Failed to save company data')
      console.error('Error saving company data:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleHistoryPreview = (record: any) => {
    setHistoryPreviewPrompt(record.prompt ?? '')
    setHistoryPreviewContent(record.content ?? '')
    setHistoryPreviewVisible(true)
  }

  const isCustomer = variant === 'customer'

  const tabItems = [
    {
      key: 'info',
      label: 'Company Information',
      children: <TabInfo companyData={companyData} groupedDatas={groupedDatas} />,
    },
    {
      key: 'users',
      label: (
        <span>
          <TeamOutlined /> Users ({companyData.company_users?.length || 0})
        </span>
      ),
      children: (
        <TabUsers
          companyData={companyData}
          viewerIsGlobalAdmin={currentUserRole?.toLowerCase() === 'admin'}
        />
      ),
    },
    {
      key: 'tickets',
      label: (
        <span>
          <CheckSquareOutlined /> Tickets
        </span>
      ),
      children: (
        <TabTickets
          companyData={companyData}
          currentUser={currentUser}
          basePath={isCustomer ? '/customer' : undefined}
        />
      ),
    },
    {
      key: 'content-planner',
      label: (
        <span>
          <FileTextOutlined /> Content Planner
        </span>
      ),
      children: (
        <TabContentPlanner
          companyData={companyData}
          basePath={variant === 'customer' ? '/customer' : undefined}
        />
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
        <TabDataForm
          form={form}
          dataTemplates={dataTemplates}
          loadingTemplates={loadingTemplates}
          saving={saving}
          onSaveAll={handleSaveAll}
        />
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
        <TabGenerate
          generateForm={generateForm}
          contentTemplates={contentTemplates}
          loadingContentTemplates={loadingContentTemplates}
          selectedContentTemplate={selectedContentTemplate}
          generatedContent={generatedContent}
          usedFieldsInGenerated={usedFieldsInGenerated}
          savingToKb={savingToKb}
          onContentTemplateChange={handleContentTemplateChange}
          onSaveToKnowledgeBase={
            COMPANY_DETAIL_KNOWLEDGE_BASE_ENABLED ? handleSaveToKnowledgeBase : undefined
          }
        />
      ),
    },
    ...(COMPANY_DETAIL_KNOWLEDGE_BASE_ENABLED
      ? [
          {
            key: 'knowledge-base' as const,
            label: (
              <span>
                <ReadOutlined /> Knowledge Base ({knowledgeBases.length})
              </span>
            ),
            children: (
              <TabKnowledgeBase
                aiSystemTemplates={aiSystemTemplates}
                loadingAiSystemTemplates={loadingAiSystemTemplates}
                ragTemplateId={ragTemplateId}
                setRagTemplateId={setRagTemplateId}
                ragPrompt={ragPrompt}
                setRagPrompt={setRagPrompt}
                ragLoading={ragLoading}
                ragResult={ragResult}
                ragErrorFull={ragErrorFull}
                onGenerate={handleGenerateFromKb}
                generationHistory={generationHistory}
                loadingGenerationHistory={loadingGenerationHistory}
                generationHistoryError={generationHistoryError}
                onHistoryPreview={handleHistoryPreview}
                knowledgeBases={knowledgeBases}
                loadingKnowledgeBases={loadingKnowledgeBases}
                onKbPreview={handleKbPreview}
                embeddingLoadingId={embeddingLoadingId}
                onAddToOpenAI={handleAddToOpenAI}
                onDeleteKb={handleDeleteKb}
              />
            ),
          },
        ]
      : []),
    {
      key: 'websites',
      label: (
        <span>
          <GlobalOutlined /> Websites ({websites.length})
        </span>
      ),
      children: (
        <TabWebsites
          websites={websites}
          loadingWebsites={loadingWebsites}
          getLastCrawlSession={getLastCrawlSession}
          onAddWebsite={handleWebsiteCreate}
          onEditWebsite={handleWebsiteEdit}
          onDeleteWebsite={handleWebsiteDelete}
        />
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
        <TabCrawling
          crawlSessions={crawlSessions}
          loadingCrawlSessions={loadingCrawlSessions}
          websites={websites}
          websitesLength={websites.length}
          onStartCrawl={handleStartCrawl}
          onCrawlDelete={handleCrawlDelete}
        />
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isCustomer ? (
        <CustomerNavbar user={currentUser} />
      ) : (
        <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      )}

      <AdminMainColumn
        collapsed={collapsed}
        user={currentUser}
        noSidebarInset={isCustomer}
      >
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
           

            <Flex justify="space-between" align="center" >
              <Title level={2} >
                {companyData.name}
              </Title>
            
            </Flex>

            <Modal
              title="Edit company"
              open={companyEditModalOpen}
              onOk={handleSaveCompany}
              onCancel={() => setCompanyEditModalOpen(false)}
              confirmLoading={companyEditLoading}
              okText="Save" 
            >
              <Form form={companyEditForm} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item name="name" label="Company name" rules={[{ required: true, message: 'Company name is required' }]}>
                  <Input placeholder="Company name" />
                </Form.Item>
                <Form.Item name="email" label="Email">
                  <Input type="email" placeholder="support@company.com" />
                </Form.Item>
              </Form>
            </Modal>


            {activeSection ? (
              (() => {
                const item = tabItems.find((t) => t.key === activeSection)
                return item ? item.children : null
              })()
            ) : (
              <Tabs items={tabItems} />
            )}

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
            >
              <Form
                form={websiteForm}
                layout="vertical"
                onFinish={handleWebsiteSubmit}
                requiredMark={false}
              >
                <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5' }}>
                  <Space orientation="vertical" size="small" style={{ width: '100%' }}>
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
                      initialValue={false}
                      tooltip="Set this as the primary website. Only one website can be primary."
                    >
                      <Switch 
                        checkedChildren="Yes" 
                        unCheckedChildren="No"
                      />
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

            {/* Knowledge Base Preview Modal */}
            <Modal
              title={kbPreviewTitle}
              open={kbPreviewVisible}
              onCancel={() => setKbPreviewVisible(false)}
              footer={[<Button key="close" onClick={() => setKbPreviewVisible(false)}>Close</Button>]}
              width={800}
            >
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '60vh',
                  overflowY: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: kbPreviewContent }}
              />
            </Modal>

            {/* Generation History Preview Modal */}
            <Modal
              title="Generation history"
              open={historyPreviewVisible}
              onCancel={() => setHistoryPreviewVisible(false)}
              footer={[<Button key="close" onClick={() => setHistoryPreviewVisible(false)}>Close</Button>]}
              width={800}
            >
              {historyPreviewPrompt ? (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Prompt:</Text>
                  <div style={{ marginTop: 4, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>{historyPreviewPrompt}</div>
                </div>
              ) : null}
              <Text strong>Content:</Text>
              <div
                style={{
                  marginTop: 8,
                  maxHeight: '50vh',
                  overflowY: 'auto',
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 8,
                  border: '1px solid #e8e8e8',
                }}
              >
                {(() => {
                  try {
                    const parsed = JSON.parse(historyPreviewContent || '')
                    if (typeof parsed === 'object' && parsed !== null) {
                      return (
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: 'monospace',
                            fontSize: 13,
                          }}
                        >
                          {JSON.stringify(parsed, null, 2)}
                        </pre>
                      )
                    }
                  } catch {
                    /* not JSON */
                  }
                  return (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {historyPreviewContent || '—'}
                    </div>
                  )
                })()}
              </div>
            </Modal>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

