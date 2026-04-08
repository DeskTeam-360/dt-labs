'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, List, Modal, Spin, Typography, Empty } from 'antd'
import { BellOutlined } from '@ant-design/icons'

const { Text } = Typography

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

  if (!loading && items.length === 0) {
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
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin />
          </div>
        ) : (
          <List
            size="small"
            dataSource={items}
            locale={{ emptyText: <Empty description="No announcements" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
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
        )}
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
          <Text style={{ whiteSpace: 'pre-wrap', display: 'block', fontSize: 15, lineHeight: 1.65 }}>
            {detail.body || '—'}
          </Text>
        ) : (
          <Text type="secondary">Could not load this announcement.</Text>
        )}
      </Modal>
    </>
  )
}
