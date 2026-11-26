'use client'

import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, List, message, Select, Space, Tag, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const { Text } = Typography

type TemplateRow = { key: string; name: string; is_active?: boolean }
type ReportRow = { id: string; template_name: string; period_date: string; status: string }

/** The maintenance reports made from this crawl, and the buttons that start one. A report needs a finished crawl. */
export default function CrawlSessionMaintenance({ sessionId, websiteId, status }: { sessionId: string; websiteId: string; status: string }) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/maintenance-reports?crawl_session_id=${sessionId}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) setRows(body.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
    fetch('/api/maintenance-templates', { credentials: 'include' })
      .then((r) => r.json())
      .then((b) => setTemplates(((b.data ?? []) as TemplateRow[]).filter((t) => t.is_active !== false)))
      .catch(() => setTemplates([]))
  }, [load])

  const create = async (template: string) => {
    setCreating(template)
    try {
      const res = await fetch('/api/maintenance-reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_id: websiteId, template, crawl_session_id: sessionId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      router.push(`/maintenance-reports/${body.id}`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not start the report')
      setCreating(null)
    }
  }

  const done = status === 'completed'
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {done ? null : <Alert type="info" showIcon title="A maintenance report can be made once this crawl has finished." />}
      <Card size="small" title="Make a maintenance report">
      <Space orientation="vertical" size="small" style={{ width: '100%' }}>
      <Space wrap>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 320 }}
          placeholder="Choose a template"
          value={chosen ?? templates[0]?.key}
          onChange={setChosen}
          disabled={!done}
          options={templates.map((t) => ({ value: t.key, label: t.name }))}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={creating !== null} disabled={!done || !(chosen ?? templates[0]?.key)} onClick={() => void create((chosen ?? templates[0]?.key) as string)}>
          Create report
        </Button>
      </Space>
      <Text type="secondary" style={{ fontSize: 12 }}>
        The report uses this crawl for broken links and pictures, and fills in SSL, plugin updates, Wordfence and domain variants. Allow a moment.
      </Text>
      </Space>
      </Card>
      <Card size="small" title={`Reports from this crawl (${rows.length})`} styles={{ body: { padding: 0 } }}>
      <List
        size="small"
        loading={loading}
        locale={{ emptyText: 'No reports from this crawl yet' }}
        dataSource={rows}
        renderItem={(r) => (
          <List.Item actions={[<Button key="open" type="link" onClick={() => router.push(`/maintenance-reports/${r.id}`)}>Open</Button>]}>
            <Space>
              <Text strong>{r.period_date}</Text>
              <Text>{r.template_name}</Text>
              <Tag color={r.status === 'final' ? 'green' : 'default'}>{r.status === 'final' ? 'Final' : 'Draft'}</Tag>
            </Space>
          </List.Item>
        )}
      />
      </Card>
    </Space>
  )
}
