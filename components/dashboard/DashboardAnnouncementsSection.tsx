'use client'

import { BellOutlined } from '@ant-design/icons'
import { Card, List, Modal, Spin, Typography } from 'antd'
import { useCallback,useEffect, useState } from 'react'

const { Text } = Typography

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function TextWithLinks({ text, style }: { text: string; style?: React.CSSProperties }) {
  const parts = text.split(URL_REGEX)
  return (
    <Text style={{ whiteSpace: 'pre-wrap', display: 'block', ...style }}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
            {part}
          </a>
        ) : (
          part
        )
      )}
    </Text>
  )
}

type ListItem = { id: string; title: string }

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function DashboardAnnouncementsSection() {
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<{ title: string; body: string } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ items: ListItem[] }>('/api/dashboard-announcements')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openDetail = async (id: string) => {
    setModalOpen(true)
    setDetail(null)
    setDetailLoading(true)
    try {
      const row = await apiFetch<{ title: string; body: string }>(`/api/dashboard-announcements/${id}`)
      setDetail({ title: row.title, body: row.body ?? '' })
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleClose = () => {
    setModalOpen(false)
    setDetail(null)
  }

  if (loading || items.length === 0) {
    return null
  }

  return (
    <>
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <span>
            <BellOutlined style={{ marginRight: 8 }} />
            Announcements
          </span>
        }
      >
        <List
            size="small"
            dataSource={items}
            renderItem={(item) => (
              <List.Item style={{ padding: '8px 0', borderBlockEnd: '1px solid var(--ticket-nav-panel-row-border, #f0f0f0)' }}>
                <button
                  type="button"
                  onClick={() => openDetail(item.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    color: 'var(--ticket-nav-filter-link, #1890ff)',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {item.title}
                </button>
              </List.Item>
            )}
          />
      </Card>

      <Modal
        title={detail?.title ?? 'Announcement'}
        open={modalOpen}
        onCancel={handleClose}
        footer={null}
        width={900}
        style={{ top: 32 }}
        destroyOnHidden
        styles={{ body: { maxHeight: 'min(70vh, 640px)', overflowY: 'auto' } }}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : detail ? (
          <TextWithLinks text={detail.body || '—'} style={{ fontSize: 15, lineHeight: 1.65 }} />
        ) : (
          <Text type="secondary">Could not load this announcement.</Text>
        )}
      </Modal>
    </>
  )
}
