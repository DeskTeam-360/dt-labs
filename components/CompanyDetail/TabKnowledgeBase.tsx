'use client'

import { Card, Select, Input, Button, Space, Typography, Table, Spin, Tag, Popconfirm } from 'antd'
import { PlayCircleOutlined, EyeOutlined, CloudUploadOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons'
import DateDisplay from '../DateDisplay'

const { TextArea } = Input
const { Text } = Typography
const { Option } = Select

interface TabKnowledgeBaseProps {
  aiSystemTemplates: { id: string; title: string }[]
  loadingAiSystemTemplates: boolean
  ragTemplateId: string | null
  setRagTemplateId: (v: string | null) => void
  ragPrompt: string
  setRagPrompt: (v: string) => void
  ragLoading: boolean
  ragResult: Record<string, unknown> | null
  ragErrorFull: string
  onGenerate: () => void
  generationHistory: any[]
  loadingGenerationHistory: boolean
  generationHistoryError: string
  onHistoryPreview: (record: any) => void
  knowledgeBases: any[]
  loadingKnowledgeBases: boolean
  onKbPreview: (record: any) => void
  embeddingLoadingId: string | null
  onAddToOpenAI: (record: any) => void
  onDeleteKb: (id: string) => void
}

export default function TabKnowledgeBase({
  aiSystemTemplates,
  loadingAiSystemTemplates,
  ragTemplateId,
  setRagTemplateId,
  ragPrompt,
  setRagPrompt,
  ragLoading,
  ragResult,
  ragErrorFull,
  onGenerate,
  generationHistory,
  loadingGenerationHistory,
  generationHistoryError,
  onHistoryPreview,
  knowledgeBases,
  loadingKnowledgeBases,
  onKbPreview,
  embeddingLoadingId,
  onAddToOpenAI,
  onDeleteKb,
}: TabKnowledgeBaseProps) {
  return (
    <div>
      <Card title="Generate content from knowledge base" style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Select an AI System Template (system instructions). The system will search the knowledge base and generate content.
        </Text>
        <Select
          placeholder="Select AI System Template"
          value={ragTemplateId}
          onChange={setRagTemplateId}
          style={{ width: '100%', marginBottom: 12 }}
          loading={loadingAiSystemTemplates}
          allowClear
        >
          {aiSystemTemplates.map((t) => (
            <Option key={t.id} value={t.id}>
              {t.title}
            </Option>
          ))}
        </Select>
        <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>Additional prompt (optional):</Text>
        <TextArea
          value={ragPrompt}
          onChange={(e) => setRagPrompt(e.target.value)}
          placeholder="e.g. Create company introduction text from the available content"
          rows={2}
          style={{ marginBottom: 12 }}
        />
        <Button type="primary" loading={ragLoading} onClick={onGenerate} icon={<PlayCircleOutlined />}>
          Generate content
        </Button>
        {ragErrorFull ? (
          <div style={{ marginTop: 16 }}>
            <Text strong type="danger">Error (full):</Text>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: '#fff2f0',
                border: '1px solid #ffccc7',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: 12,
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {ragErrorFull}
            </div>
          </div>
        ) : null}
        {ragResult ? (
          <div style={{ marginTop: 16 }}>
            <Text strong>Result (JSON):</Text>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: '#fafafa',
                border: '1px solid #e8e8e8',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 400,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              {JSON.stringify(ragResult, null, 2)}
            </pre>
          </div>
        ) : null}
      </Card>
      <Card title={<span><HistoryOutlined /> Generation history</span>} style={{ marginBottom: 24 }}>
        {generationHistoryError ? (
          <div style={{ marginBottom: 12 }}>
            <Text type="danger" strong>Error loading history:</Text>
            <div
              style={{
                marginTop: 6,
                padding: 10,
                background: '#fff2f0',
                border: '1px solid #ffccc7',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {generationHistoryError}
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              If the error mentions &quot;relation does not exist&quot; or missing table, run the migrations in Supabase: <code>create_company_content_generation_history_table.sql</code> and <code>fix_company_content_generation_history_created_by.sql</code>.
            </Text>
          </div>
        ) : null}
        {loadingGenerationHistory ? (
          <Spin />
        ) : generationHistory.length === 0 && !generationHistoryError ? (
          <Text type="secondary">No history yet. Results from knowledge base generation will be saved here.</Text>
        ) : generationHistory.length > 0 ? (
          <Table
            dataSource={generationHistory}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: 'Prompt',
                dataIndex: 'prompt',
                key: 'prompt',
                ellipsis: true,
                render: (p: string) => (
                  <Text ellipsis style={{ maxWidth: 280 }}>
                    {p || '—'}
                  </Text>
                ),
              },
              {
                title: 'Content',
                dataIndex: 'content',
                key: 'content',
                ellipsis: true,
                render: (c: string) => {
                  if (!c) return '—'
                  try {
                    const parsed = JSON.parse(c)
                    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                      const keys = Object.keys(parsed)
                      const preview = keys.length ? `{ ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '…' : ''} }` : '{}'
                      return (
                        <Text ellipsis style={{ maxWidth: 220 }} title={preview}>
                          {preview}
                        </Text>
                      )
                    }
                  } catch {
                    /* not JSON */
                  }
                  const plain = c.replace(/<[^>]*>/g, '').trim()
                  return (
                    <Text ellipsis style={{ maxWidth: 220 }}>
                      {plain.slice(0, 50)}{plain.length > 50 ? '…' : ''}
                    </Text>
                  )
                },
              },
              {
                title: 'Date',
                dataIndex: 'created_at',
                key: 'created_at',
                width: 160,
                render: (d: string) => <DateDisplay date={d} />,
              },
              {
                title: '',
                key: 'actions',
                width: 80,
                render: (_: unknown, record: any) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => onHistoryPreview(record)}
                  >
                    Preview
                  </Button>
                ),
              },
            ]}
          />
        ) : null}
      </Card>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Content saved from Generate Content for this company. One row per content template.
      </Text>
      {loadingKnowledgeBases ? (
        <Spin />
      ) : knowledgeBases.length === 0 ? (
        <Card>
          <Text type="secondary">No knowledge base entries yet. Use Generate Content and click Save to Knowledge Base.</Text>
        </Card>
      ) : (
        <Table
          dataSource={knowledgeBases}
          rowKey="id"
          columns={[
            {
              title: 'Type',
              dataIndex: 'type',
              key: 'type',
              render: (t: string | null) => t || '—',
            },
            {
              title: 'Template',
              key: 'template',
              render: (_: unknown, record: any) => record.company_content_templates?.title ?? '—',
            },
            {
              title: 'Content',
              dataIndex: 'content',
              key: 'content',
              ellipsis: true,
              render: (c: string | null) => (
                <Text ellipsis style={{ maxWidth: 200 }}>
                  {c ? (c.replace(/<[^>]*>/g, '').slice(0, 80) + (c.length > 80 ? '...' : '')) : '—'}
                </Text>
              ),
            },
            {
              title: 'Fields',
              key: 'fields',
              render: (_: unknown, record: any) => {
                const arr = record.company_content_templates?.fields ?? record.used_fields ?? null
                return arr?.length ? (
                  <Space size={[4, 4]} wrap>
                    {arr.slice(0, 5).map((f: string, i: number) => (
                      <Tag key={i}>{f}</Tag>
                    ))}
                    {arr.length > 5 && <Tag>+{arr.length - 5}</Tag>}
                  </Space>
                ) : (
                  '—'
                )
              },
            },
            {
              title: 'Updated',
              dataIndex: 'is_updated',
              key: 'is_updated',
              render: (v: boolean) => (v ? <Tag color="blue">Yes</Tag> : <Tag>No</Tag>),
            },
            {
              title: 'Updated at',
              dataIndex: 'updated_at',
              key: 'updated_at',
              render: (d: string) => <DateDisplay date={d} />,
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, record: any) => (
                <Space>
                  <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onKbPreview(record)}>
                    Preview
                  </Button>
                  {!record.is_updated && (
                    <Button
                      type="link"
                      size="small"
                      icon={<CloudUploadOutlined />}
                      loading={embeddingLoadingId === record.id}
                      onClick={() => onAddToOpenAI(record)}
                    >
                      Add to OpenAI
                    </Button>
                  )}
                  <Popconfirm
                    title="Remove from Knowledge Base?"
                    onConfirm={() => onDeleteKb(record.id)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
