'use client'

import { Card, Form, Button, Space, Divider, Typography, Select, Input, message } from 'antd'
import { SaveOutlined, FileTextOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'

const { Option } = Select
const { Text } = Typography

interface TabGenerateProps {
  generateForm: FormInstance
  contentTemplates: any[]
  loadingContentTemplates: boolean
  selectedContentTemplate: string | null
  generatedContent: string
  usedFieldsInGenerated: string[]
  savingToKb: boolean
  onContentTemplateChange: (templateId: string) => void
  /** Omitted when company Knowledge Base tab is disabled */
  onSaveToKnowledgeBase?: () => void
}

export default function TabGenerate({
  generateForm,
  contentTemplates,
  loadingContentTemplates,
  selectedContentTemplate,
  generatedContent,
  usedFieldsInGenerated,
  savingToKb,
  onContentTemplateChange,
  onSaveToKnowledgeBase,
}: TabGenerateProps) {
  return (
    <div>
      <Form form={generateForm} layout="vertical">
        <Form.Item
          label="Content Template"
          name="content_template_id"
          rules={[{ required: true, message: 'Please select a content template' }]}
        >
          <Select
            placeholder="Select a content template"
            size="large"
            loading={loadingContentTemplates}
            onChange={onContentTemplateChange}
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
            <Space wrap>
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
              {onSaveToKnowledgeBase ? (
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={onSaveToKnowledgeBase}
                  loading={savingToKb}
                >
                  Save to Knowledge Base
                </Button>
              ) : null}
            </Space>
            {usedFieldsInGenerated.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Fields used in this content: {usedFieldsInGenerated.join(', ')}
                </Text>
              </div>
            )}
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
  )
}
