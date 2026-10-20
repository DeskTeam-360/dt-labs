'use client'

import { Alert, Empty, Flex, Input, List, message, Modal, Space, Tag, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

const { Text } = Typography

type Found = { id: number; title: string; companyName: string | null; mergedInto: number | null }

/** Pick other tickets and merge them into this (primary) ticket. Copies description + comments as internal notes. */
export default function MergeTicketModal({
  open,
  primaryId,
  onClose,
  onMerged,
}: {
  open: boolean
  primaryId: number
  onClose: () => void
  onMerged: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<Found[]>([])
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setPicked([])
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (timer.current) clearTimeout(timer.current)
    if (q.length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `/api/tickets?search=${encodeURIComponent(q.replace(/^#/, ''))}&search_fields=${encodeURIComponent('id,title')}&limit=10`,
          { credentials: 'include' }
        )
        const data = (await res.json().catch(() => [])) as unknown
        const list = Array.isArray(data) ? data : []
        setResults(
          list
            .map((row: unknown) => {
              const r = row as { id?: number; title?: string | null; company?: { name?: string | null } | null; merged_into_ticket_id?: number | null }
              return {
                id: r.id ?? 0,
                title: r.title ?? '',
                companyName: r.company?.name?.trim() || null,
                mergedInto: r.merged_into_ticket_id ?? null,
              }
            })
            .filter((r) => r.id > 0 && r.id !== primaryId)
        )
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, open, primaryId])

  const toggle = (t: Found) =>
    setPicked((prev) => (prev.some((p) => p.id === t.id) ? prev.filter((p) => p.id !== t.id) : [...prev, t]))

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${primaryId}/merge`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secondary_ids: picked.map((p) => p.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Merge failed')
      message.success(`Merged ${picked.length} ticket${picked.length === 1 ? '' : 's'}`)
      onMerged()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Merge tickets into #${primaryId}`}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={picked.length > 0 ? `Merge ${picked.length} ticket${picked.length === 1 ? '' : 's'}` : 'Merge'}
      okButtonProps={{ disabled: picked.length === 0, loading: saving }}
      destroyOnHidden
      width={640}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          title="This cannot be undone."
          description={`The description and all comments of the selected tickets are copied into #${primaryId} as internal notes, with their attachments. The selected tickets are marked “Part of #${primaryId}” and closed. Time tracked stays on the original tickets.`}
        />
        <Input.Search
          autoFocus
          allowClear
          placeholder="Search by ticket ID or title"
          loading={searching}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {picked.length > 0 ? (
          <Flex wrap="wrap" gap={6}>
            {picked.map((p) => (
              <Tag key={p.id} closable onClose={() => toggle(p)} color="blue">
                #{p.id} {p.title.length > 40 ? `${p.title.slice(0, 40)}…` : p.title}
              </Tag>
            ))}
          </Flex>
        ) : null}
        <List
          size="small"
          bordered
          style={{ maxHeight: 280, overflow: 'auto' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim().length < 2 ? 'Type at least 2 characters' : 'No tickets found'} /> }}
          dataSource={results}
          renderItem={(t) => {
            const checked = picked.some((p) => p.id === t.id)
            const blocked = t.mergedInto != null
            return (
              <List.Item
                onClick={() => (blocked ? undefined : toggle(t))}
                style={{ cursor: blocked ? 'not-allowed' : 'pointer', background: checked ? 'var(--ant-color-primary-bg, #e6f4ff)' : undefined, opacity: blocked ? 0.5 : 1 }}
              >
                <Flex vertical gap={0} style={{ width: '100%' }}>
                  <Text strong>
                    #{t.id} {t.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.companyName ?? 'No company'}
                    {blocked ? ` · already part of #${t.mergedInto}` : ''}
                  </Text>
                </Flex>
              </List.Item>
            )
          }}
        />
      </Space>
    </Modal>
  )
}
