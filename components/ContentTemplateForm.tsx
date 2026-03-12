'use client'

import {
  Layout,
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  message,
  Tag,
  Divider,
  Row,
  Col,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CopyOutlined } from '@ant-design/icons'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input

interface ContentTemplateFormProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  template?: {
    id: string
    title: string
    content: string | null
    description: string | null
    fields?: string[] | null
    type?: string | null
  }
}

interface DataTemplate {
  id: string
  title: string
  group: string | null
  is_active: boolean
}

export default function ContentTemplateForm({
  user: currentUser,
  template,
}: ContentTemplateFormProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [dataTemplates, setDataTemplates] = useState<DataTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [contentValue, setContentValue] = useState('')
  const [form] = Form.useForm()
  const contentTextAreaRef = useRef<any>(null)
  const supabase = createClient()

  const isEditMode = !!template

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (template) {
      console.log('[useEffect template] Loading template:', template)
      form.setFieldsValue({
        title: template.title,
        content: template.content || '',
        description: template.description || '',
        type: template.type || '',
      })
      const initialContent = template.content || ''
      console.log('[useEffect template] Setting contentValue to:', initialContent)
      setContentValue(initialContent)
    } else {
      console.log('[useEffect template] No template, resetting contentValue')
      setContentValue('')
    }
  }, [template, form])

  useEffect(() => {
    fetchDataTemplates()
  }, [])

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
    } catch (error: any) {
      message.error('Failed to load data templates')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const insertTextAtCursor = (text: string) => {
    console.log('[insertTextAtCursor] Called with text:', text)
    
    // Try multiple ways to access the textarea element
    const textAreaRef = contentTextAreaRef.current
    if (!textAreaRef) {
      console.log('[insertTextAtCursor] textAreaRef not found')
      return false
    }

    // Get the actual textarea element from Ant Design's TextArea
    // Ant Design TextArea structure: ref.resizableTextArea.textArea
    const actualTextArea = 
      textAreaRef.resizableTextArea?.textArea ||
      textAreaRef.nativeElement ||
      (textAreaRef as any)?.input ||
      textAreaRef
    
    if (!actualTextArea) {
      console.log('[insertTextAtCursor] actualTextArea not found')
      return false
    }

    // Ensure it's an HTMLTextAreaElement
    const textArea = actualTextArea instanceof HTMLTextAreaElement 
      ? actualTextArea 
      : null
    
    if (!textArea) {
      console.log('[insertTextAtCursor] textArea is not HTMLTextAreaElement')
      return false
    }

    // Get current selection and content
    const start = textArea.selectionStart || 0
    const end = textArea.selectionEnd || 0
    const currentContent = contentValue || textArea.value || form.getFieldValue('content') || ''
    
    console.log('[insertTextAtCursor] Current state:', {
      start,
      end,
      contentValue,
      textAreaValue: textArea.value,
      formValue: form.getFieldValue('content'),
      currentContent,
    })
    
    // Build new content with inserted text
    const newContent = currentContent.substring(0, start) + text + currentContent.substring(end)
    
    console.log('[insertTextAtCursor] New content:', newContent)
    
    // Update React state - this is the key!
    console.log('[insertTextAtCursor] Calling setContentValue with:', newContent)
    setContentValue(newContent)
    
    // Update form value
    console.log('[insertTextAtCursor] Calling form.setFieldsValue with:', newContent)
    form.setFieldsValue({ content: newContent })
    
    // Update textarea value directly for immediate visual feedback
    console.log('[insertTextAtCursor] Updating textArea.value directly')
    textArea.value = newContent
    
    // Set cursor position after inserted text
    setTimeout(() => {
      if (textArea) {
        textArea.focus()
        const newCursorPos = start + text.length
        textArea.setSelectionRange(newCursorPos, newCursorPos)
        console.log('[insertTextAtCursor] Cursor set to position:', newCursorPos)
      }
    }, 10)
    
    console.log('[insertTextAtCursor] Insert completed, returning true')
    return true
  }

  const handleCopyTemplateId = async (templateId: string, templateTitle: string) => {
    const formattedId = `{{${templateId}}}`

    // Get textarea element first
    const textAreaRef = contentTextAreaRef.current
    if (!textAreaRef) {
      // Fallback to clipboard if ref not available
      try {
        await navigator.clipboard.writeText(formattedId)
        message.success(`Copied: ${formattedId} (${templateTitle}) - Click in content field to paste`)
      } catch (error) {
        message.error('Failed to copy to clipboard')
      }
      return
    }

    // Get the actual textarea element
    const textArea = 
      textAreaRef.resizableTextArea?.textArea ||
      textAreaRef.nativeElement ||
      (textAreaRef as any)?.input

    // Try to insert if textarea exists
    if (textArea && textArea instanceof HTMLTextAreaElement) {
      // Focus textarea first if not already focused
      if (document.activeElement !== textArea) {
        textArea.focus()
        // Small delay to ensure focus is set
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      const inserted = insertTextAtCursor(formattedId)

      if (inserted) {
        // Also copy to clipboard for backup
        try {
          await navigator.clipboard.writeText(formattedId)
        } catch (error) {
          // Silent fail for clipboard, main action (insert) succeeded
        }
        message.success(`Inserted: ${formattedId} (${templateTitle})`)
        return
      }
    }

    // If insertion failed, fallback to clipboard
    try {
      await navigator.clipboard.writeText(formattedId)
      message.success(`Copied: ${formattedId} (${templateTitle}) - Click in content field to paste`)

      // Focus textarea for easy pasting
      setTimeout(() => {
        const textAreaElement =
          contentTextAreaRef.current?.resizableTextArea?.textArea ||
          contentTextAreaRef.current?.input ||
          contentTextAreaRef.current
        if (textAreaElement && textAreaElement instanceof HTMLTextAreaElement) {
          textAreaElement.focus()
        }
      }, 100)
    } catch (error) {
      // Fallback for older browsers
      const tempTextArea = document.createElement('textarea')
      tempTextArea.value = formattedId
      tempTextArea.style.position = 'fixed'
      tempTextArea.style.left = '-999999px'
      document.body.appendChild(tempTextArea)
      tempTextArea.select()
      try {
        document.execCommand('copy')
        message.success(`Copied: ${formattedId} (${templateTitle}) - Click in content field to paste`)

        // Focus textarea for easy pasting
        setTimeout(() => {
          const textAreaElement =
            contentTextAreaRef.current?.resizableTextArea?.textArea ||
            contentTextAreaRef.current?.input ||
            contentTextAreaRef.current
          if (textAreaElement && textAreaElement instanceof HTMLTextAreaElement) {
            textAreaElement.focus()
          }
        }, 100)
      } catch (err) {
        message.error('Failed to copy to clipboard')
      }
      document.body.removeChild(tempTextArea)
    }
  }

  // Group data templates by group
  const groupedTemplates = dataTemplates.reduce((acc, template) => {
    const group = template.group || 'Other'
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(template)
    return acc
  }, {} as Record<string, DataTemplate[]>)

  // Extract field names from content placeholders {{field_name}}
  const extractFieldsFromContent = (text: string | null): string[] => {
    if (!text || typeof text !== 'string') return []
    const matches = text.matchAll(/\{\{([^}]+)\}\}/g)
    const seen = new Set<string>()
    for (const m of matches) {
      const key = (m[1] || '').trim()
      if (key && !seen.has(key)) seen.add(key)
    }
    return [...seen]
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      const submitContent = contentValue || null
      const fieldsArr = extractFieldsFromContent(submitContent)
      const typeVal = values.type ? String(values.type).trim() || null : null

      if (isEditMode && template) {
        // Update existing template
        const { error } = await supabase
          .from('company_content_templates')
          .update({
            title: values.title,
            content: submitContent,
            description: values.description || null,
            type: typeVal,
            fields: fieldsArr.length > 0 ? fieldsArr : null,
          })
          .eq('id', template.id)

        if (error) throw error

        message.success('Content template updated successfully')
        router.push('/company-content-templates')
      } else {
        // Create new template
        const { error } = await supabase
          .from('company_content_templates')
          .insert({
            title: values.title,
            content: submitContent,
            description: values.description || null,
            type: typeVal,
            fields: fieldsArr.length > 0 ? fieldsArr : null,
          })

        if (error) throw error

        message.success('Content template created successfully')
        router.push('/company-content-templates')
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save content template')
    } finally {
      setLoading(false)
    }
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
          marginLeft: mounted ? (collapsed ? 80 : 250) : 250,
          transition: 'margin-left 0.2s',
        }}
        suppressHydrationWarning
      >
        <Content
          style={{
            padding: '24px',
            background: '#f0f2f5',
            minHeight: '100vh',
          }}
        >
          <Card>
            <Space style={{ marginBottom: 24 }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push('/company-content-templates')}
              >
                Back to Templates
              </Button>
            </Space>

            <Title level={2} style={{ marginBottom: 24 }}>
              {isEditMode ? 'Edit Content Template' : 'Create Content Template'}
            </Title>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              autoComplete="off"
            >
              <Form.Item
                name="title"
                label="Title"
                rules={[
                  { required: true, message: 'Please enter template title!' },
                ]}
              >
                <Input placeholder="Template Title" size="large" />
              </Form.Item>

              <Form.Item
                name="description"
                label="Description"
                extra="Optional: Brief description of this template"
              >
                <Input placeholder="Template Description" size="large" />
              </Form.Item>

              <Form.Item name="type" label="Type" extra="Optional: e.g. email, blog">
                <Input placeholder="Template type" size="large" />
              </Form.Item>

              <Row>
                <Col span={12}>
                  <Form.Item label="Content">
                    <TextArea
                      ref={contentTextAreaRef}
                      value={contentValue}
                      style={{ height: '500px' }}
                      placeholder="Enter template content here... Use data template IDs like: {{template-id}} or {{company-name}}"
                      showCount
                  onChange={(e) => {
                    const newValue = e.target.value
                    console.log('[TextArea onChange] New value:', newValue)
                    console.log('[TextArea onChange] Current contentValue before update:', contentValue)
                    setContentValue(newValue)
                    console.log('[TextArea onChange] Called setContentValue')
                  }}
                    />
                    <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                      Click on data template chips to insert them at cursor position. Fields are auto-detected from placeholders like {`{{about_us_content}}`}.
                    </Text>
                    {contentValue && extractFieldsFromContent(contentValue).length > 0 && (
                      <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                        Fields to save: {extractFieldsFromContent(contentValue).join(', ')}
                      </Text>
                    )}
                  </Form.Item>
                </Col>
                <Col span={12} style={{ paddingLeft: 16 }}>
                  <Form.Item

                    label="Available Data Templates"
                  >
                    <div style={{ height: '500px', overflow: 'auto' }}>
                      {loadingTemplates ? (
                        <Text type="secondary">Loading templates...</Text>
                      ) : dataTemplates.length === 0 ? (
                        <Text type="secondary">No active data templates available</Text>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {Object.entries(groupedTemplates).map(([group, templates]) => (
                            <div key={group}>
                              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                {group}
                              </Text>
                              <Space size={[8, 8]} wrap>
                                {templates.map((template) => (
                                  <Tag
                                    key={template.id}
                                    style={{
                                      cursor: 'pointer',
                                      padding: '4px 12px',
                                      fontSize: 13,
                                      borderRadius: 4,
                                      border: '1px solid #d9d9d9',
                                      transition: 'all 0.2s',
                                    }}
                                    onClick={() => handleCopyTemplateId(template.id, template.title)}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = '#1890ff'
                                      e.currentTarget.style.color = '#1890ff'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = '#d9d9d9'
                                      e.currentTarget.style.color = 'inherit'
                                    }}
                                  >
                                    {template.title}

                                  </Tag>
                                ))}
                              </Space>
                            </div>
                          ))}
                        </div>
                      )}


                    </div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8, paddingRight: 100 }}>Click on any template chip to copy its ID to clipboard, then paste it in the content field above</Text>

                  </Form.Item>
                </Col>
              </Row>
              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={loading}
                    size="large"
                  >
                    {isEditMode ? 'Update Template' : 'Create Template'}
                  </Button>
                  <Button
                    size="large"
                    onClick={() => router.push('/company-content-templates')}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}

