'use client'

import { Layout, Button, Typography, Card, Space, message, Spin } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, EyeOutlined } from '@ant-design/icons'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from '../AdminSidebar'
import AdminMainColumn from '../AdminMainColumn'
import CommentWysiwyg from '../TicketDetail/CommentWysiwyg'
import MessageTemplatePlaceholdersPanel from '../MessageTemplatePlaceholdersPanel'
import MessageTemplatePreviewModal from '../MessageTemplatePreviewModal'
import type { MessageTemplateRow } from './MessageTemplatesContent'

const { Content } = Layout
const { Title, Text } = Typography

interface MessageTemplateEditContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null }; role?: string }
  templateId: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function MessageTemplateEditContent({
  user: currentUser,
  templateId,
}: MessageTemplateEditContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [row, setRow] = useState<MessageTemplateRow | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<MessageTemplateRow>(`/api/message-templates/${templateId}`)
      setRow(data)
      setContent(data.content ?? '')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to load template')
      setRow(null)
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (row?.status !== 'active') {
      message.warning('Inactive templates are locked for now.')
      return
    }
    setSaving(true)
    try {
      const updated = await apiFetch<MessageTemplateRow>(`/api/message-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() ? content : null }),
      })
      setRow(updated)
      message.success('Template saved')
      router.push('/settings/message-templates')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: 24 }}>
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Space wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/settings/message-templates')}>
                  Back to list
                </Button>
              </Space>

              {loading ? (
                <Spin />
              ) : !row ? (
                <Text type="danger">Template not found.</Text>
              ) : (
                <>
                  <div>
                    <Title level={4} style={{ marginBottom: 4 }}>
                      {row.title}
                    </Title>
                    <Space direction="vertical" size={0}>
                      <Text type="secondary">
                        <strong>Group:</strong> {row.group}
                      </Text>
                      <Text type="secondary" copyable={{ text: row.key }}>
                        <strong>Key:</strong> {row.key}
                      </Text>
                      <Text type="secondary">
                        <strong>Type:</strong> {row.type}
                      </Text>
                      <Text type="secondary">
                        <strong>Status:</strong> {row.status === 'active' ? 'Active' : 'Inactive'}
                      </Text>
                    </Space>
                  </div>

                  <MessageTemplatePlaceholdersPanel />

                  {row.status !== 'active' && (
                    <Text type="warning" style={{ display: 'block' }}>
                      This template is inactive. Preview and edit are temporarily disabled.
                    </Text>
                  )}

                  <div style={{ marginTop: 20, paddingBottom: 20 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Body (rich text)
                    </Text>
                    <CommentWysiwyg
                      value={content}
                      onChange={setContent}
                      placeholder="Compose your template… Leave empty for no default body."
                      height="400px"
                      bgColor="#fff"
                      useSemanticHTML={false}
                    />
                  </div>

                  <Space wrap>
                    <Button
                      icon={<EyeOutlined />}
                      disabled={row.status !== 'active'}
                      onClick={() => setPreviewOpen(true)}
                    >
                      Preview
                    </Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      disabled={row.status !== 'active'}
                      onClick={() => void save()}
                    >
                      Save and return to list
                    </Button>
                    <Button onClick={() => router.push('/settings/message-templates')}>Cancel</Button>
                  </Space>

                  <MessageTemplatePreviewModal
                    open={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                    templateBody={content}
                  />
                </>
              )}
            </Space>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
