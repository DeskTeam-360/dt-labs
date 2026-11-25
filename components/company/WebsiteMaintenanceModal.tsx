'use client'

import { PlusOutlined } from '@ant-design/icons'
import { Button, List, message, Modal, Space, Tag, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const { Text } = Typography

type TemplateRow = { id: string; key: string; name: string }
type ReportRow = { id: string; template_name: string; template_key: string; period_date: string; status: string }

/** The maintenance reports of one website (newest first) and the buttons that start a weekly or monthly one. */
export default function WebsiteMaintenanceModal({ website, onClose }: { website: { id: string; url: string } | null; onClose: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateRow[]>([])

  useEffect(() => {
    if (!website) return
    fetch('/api/maintenance-templates', { credentials: 'include' })
      .then((r) => r.json())
      .then((b) => setTemplates(b.data ?? []))
      .catch(() => setTemplates([]))
  }, [website])

  const load = useCallback(async () => {
    if (!website) return
    setLoading(true)
    try {
      const res = await fetch(`/api/maintenance-reports?website_id=${website.id}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) setRows(body.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [website])

  useEffect(() => {
    setRows([])
    void load()
  }, [load])

  const create = async (template: string) => {
    if (!website) return
    setCreating(template)
    try {
      const res = await fetch('/api/maintenance-reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_id: website.id, template }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      router.push(`/maintenance-reports/${body.id}`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not start the report')
      setCreating(null)
    }
  }

  return (
    <Modal open={website !== null} onCancel={onClose} footer={null} title="Maintenance reports" width={640} destroyOnHidden>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">{website?.url}</Text>
        <Space wrap>
          {templates.map((t, i) => (
            <Button key={t.key} type={i === 0 ? 'primary' : 'default'} icon={<PlusOutlined />} loading={creating === t.key} disabled={creating !== null} onClick={() => void create(t.key)}>
              New {t.name}
            </Button>
          ))}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          A new report fills in what the system can check (SSL, plugin updates, Wordfence, pictures, broken links, domain variants). Allow a moment.
        </Text>
        <List
          size="small"
          bordered
          loading={loading}
          locale={{ emptyText: 'No reports yet' }}
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
      </Space>
    </Modal>
  )
}
