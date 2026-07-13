'use client'

import { Button, Divider, List, Modal, Spin, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useState } from 'react'

import { summarizeAnchorSearchParams } from '@/lib/ticket-ai-summary-anchor'
import { linkifyAiOutputItems, summaryItemsToCommentHtml } from '@/lib/ticket-comment-utils'
import type { SummarizeAnchorRequest } from '@/lib/ticket-summarize-types'

const { Text } = Typography

const listItemStyle = { display: 'list-item' as const, marginLeft: 20, border: 'none', padding: '4px 0' }

type SummaryApiPayload = {
  summary?: string[]
  checklist?: string[]
  items?: string[]
  cached?: boolean
  created_at?: string | null
  error?: string
}

export type CommentAiSummaryModalProps = {
  open: boolean
  onClose: () => void
  ticketId: number
  summarizeAnchor: SummarizeAnchorRequest
  onAddComment?: (html: string) => Promise<void>
  onAddChecklistItems?: (titles: string[]) => Promise<void>
  onApplyToDescription?: (html: string) => Promise<void>
  addCommentLoading?: boolean
  /** Called after summary is first generated so triggers can show "view" state. */
  onSummarySaved?: () => void
}

export default function CommentAiSummaryModal({
  open,
  onClose,
  ticketId,
  summarizeAnchor,
  onAddComment,
  onAddChecklistItems,
  onApplyToDescription,
  addCommentLoading = false,
  onSummarySaved,
}: CommentAiSummaryModalProps) {
  const [loading, setLoading] = useState(false)
  const [summaryItems, setSummaryItems] = useState<string[]>([])
  const [checklistItems, setChecklistItems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<
    'comment' | 'checklist' | 'description' | 'both' | null
  >(null)

  const parsePayload = (data: SummaryApiPayload) => {
    const summary = Array.isArray(data.summary)
      ? data.summary
      : Array.isArray(data.items)
        ? data.items
        : []
    const checklist = Array.isArray(data.checklist) ? data.checklist : []
    if (summary.length === 0 && checklist.length === 0) {
      throw new Error('Empty summary')
    }
    setSummaryItems(summary)
    setChecklistItems(checklist)
    setCached(Boolean(data.cached))
    setSavedAt(data.created_at ?? null)
  }

  const anchorBody = () =>
    summarizeAnchor.type === 'comment'
      ? { anchor: 'comment', commentId: summarizeAnchor.commentId }
      : { anchor: summarizeAnchor.type === 'ticket' ? 'ticket' : 'description' }

  const markApplied = async (target: 'comment' | 'description' | 'checklist') => {
    await fetch(`/api/tickets/${ticketId}/comments/summarize`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apply: target, ...anchorBody() }),
    })
  }

  const loadSummary = useCallback(async () => {
    if (!ticketId) return
    setLoading(true)
    setError(null)
    setSummaryItems([])
    setChecklistItems([])
    setCached(false)
    setSavedAt(null)
    try {
      const getRes = await fetch(
        `/api/tickets/${ticketId}/comments/summarize?${summarizeAnchorSearchParams(summarizeAnchor)}`,
        { credentials: 'include' }
      )
      if (getRes.ok) {
        const data = (await getRes.json()) as SummaryApiPayload
        parsePayload(data)
        return
      }

      const postRes = await fetch(`/api/tickets/${ticketId}/comments/summarize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(anchorBody()),
      })
      const postText = await postRes.text()
      let data: SummaryApiPayload
      try {
        data = JSON.parse(postText) as SummaryApiPayload
      } catch {
        throw new Error(
          postRes.ok
            ? 'Server returned an invalid response'
            : `Summary request failed (${postRes.status})`
        )
      }
      if (!postRes.ok) {
        throw new Error(data.error || 'Failed to generate summary')
      }
      parsePayload({ ...data, cached: data.cached ?? false })
      onSummarySaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [ticketId, summarizeAnchor, onSummarySaved])

  const handleAfterOpen = (visible: boolean) => {
    if (visible) void loadSummary()
    else {
      setSummaryItems([])
      setChecklistItems([])
      setError(null)
      setCached(false)
      setSavedAt(null)
      setActionLoading(null)
    }
  }

  const handleAddAsComment = async () => {
    if (summaryItems.length === 0 || !onAddComment) return
    setActionLoading('comment')
    try {
      await onAddComment(summaryItemsToCommentHtml(summaryItems))
      await markApplied('comment')
      onClose()
    } finally {
      setActionLoading(null)
    }
  }

  const handleApplyToDescription = async () => {
    if (summaryItems.length === 0 || !onApplyToDescription) return
    setActionLoading('description')
    try {
      await onApplyToDescription(summaryItemsToCommentHtml(summaryItems))
      await markApplied('description')
      onClose()
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddToChecklist = async () => {
    if (!onAddChecklistItems || checklistItems.length === 0) return
    setActionLoading('checklist')
    try {
      await onAddChecklistItems(linkifyAiOutputItems(checklistItems))
      await markApplied('checklist')
      onClose()
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddCommentAndChecklist = async () => {
    const canComment = summaryItems.length > 0 && onAddComment
    const canChecklist = checklistItems.length > 0 && onAddChecklistItems
    if (!canComment && !canChecklist) return
    setActionLoading('both')
    try {
      if (canComment) {
        await onAddComment(summaryItemsToCommentHtml(summaryItems))
        await markApplied('comment')
      }
      if (canChecklist) {
        await onAddChecklistItems(linkifyAiOutputItems(checklistItems))
        await markApplied('checklist')
      }
      onClose()
    } finally {
      setActionLoading(null)
    }
  }

  const busy = loading || addCommentLoading || actionLoading != null
  const canAddBoth =
    onAddComment &&
    onAddChecklistItems &&
    (summaryItems.length > 0 || checklistItems.length > 0)

  const savedLabel = savedAt
    ? dayjs(savedAt).format('MMM D, YYYY HH:mm')
    : null

  return (
    <Modal
      title="AI Summary"
      open={open}
      onCancel={onClose}
      afterOpenChange={handleAfterOpen}
      width={880}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={busy}>
            Close
          </Button>
          {onAddChecklistItems ? (
            <Button
              onClick={() => void handleAddToChecklist()}
              loading={actionLoading === 'checklist'}
              disabled={busy || checklistItems.length === 0}
            >
              Add to checklist
            </Button>
          ) : null}
          {onApplyToDescription ? (
            <Button
              type={onAddComment ? 'default' : 'primary'}
              onClick={() => void handleApplyToDescription()}
              loading={actionLoading === 'description'}
              disabled={busy || summaryItems.length === 0}
            >
              Apply to description
            </Button>
          ) : null}
          {onAddComment ? (
            <Button
              onClick={() => void handleAddAsComment()}
              loading={actionLoading === 'comment'}
              disabled={busy || summaryItems.length === 0}
            >
              Add as comment
            </Button>
          ) : null}
          {canAddBoth ? (
            <Button
              type="primary"
              onClick={() => void handleAddCommentAndChecklist()}
              loading={actionLoading === 'both'}
              disabled={busy || (summaryItems.length === 0 && checklistItems.length === 0)}
            >
              Add to comment and checklist
            </Button>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
          <div style={{ marginTop: 12 }}>
            <Text type="secondary">Loading summary…</Text>
          </div>
        </div>
      ) : error ? (
        <Text type="danger">{error}</Text>
      ) : (
        <>
          {cached ? (
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              {summarizeAnchor.type === 'comment'
                ? 'Saved summary for this comment'
                : summarizeAnchor.type === 'ticket'
                  ? 'Saved summary for ticket header'
                  : 'Saved summary for description'}
              {savedLabel ? ` · ${savedLabel}` : ''}. Cannot regenerate this anchor — reopen anytime
              until you add it below.
            </Text>
          ) : (
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Generated and saved for this anchor. Reopen later without running AI again.
            </Text>
          )}
          {summaryItems.length > 0 ? (
            <>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Summary (comment / description)
              </Typography.Title>
              <List
                size="small"
                split={false}
                dataSource={summaryItems}
                renderItem={(item) => (
                  <List.Item style={{ ...listItemStyle, listStyleType: 'disc' }}>{item}</List.Item>
                )}
              />
            </>
          ) : null}
          {summaryItems.length > 0 && checklistItems.length > 0 ? (
            <Divider style={{ margin: '16px 0' }} />
          ) : null}
          {checklistItems.length > 0 ? (
            <>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Commands (checklist)
              </Typography.Title>
              <List
                size="small"
                split={false}
                dataSource={checklistItems}
                renderItem={(item) => (
                  <List.Item style={{ ...listItemStyle, listStyleType: 'decimal' }}>
                    {item}
                  </List.Item>
                )}
              />
            </>
          ) : null}
        </>
      )}
    </Modal>
  )
}
