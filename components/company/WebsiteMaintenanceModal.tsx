'use client'

import { Button, List, Modal, Space, Tag, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const { Text } = Typography

type ReportRow = { id: string; template_name: string; template_key: string; period_date: string; status: string }

/** The maintenance reports of one website (newest first). New reports are made from a crawl. */
export default function WebsiteMaintenanceModal({ website, onClose }: { website: { id: string; url: string } | null; onClose: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)

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

  return (
    <Modal open={website !== null} onCancel={onClose} footer={null} title="Maintenance reports" width={640} destroyOnHidden>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">{website?.url}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Reports of this website. To make a new one, open a finished crawl (expand the website, then View) and use its Maintenance tab.
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
