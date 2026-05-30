'use client'

import { Button, Divider, List, Modal, Spin, Typography } from 'antd'
import { useCallback, useState } from 'react'

import {
  linkifyAiOutputItems,
  type SummarizeAnchorRequest,
  summaryItemsToCommentHtml,
} from '@/lib/ticket-comment-summarize'

const { Text, Title } = Typography

const listItemStyle = { display: 'list-item' as const, marginLeft: 20, border: 'none', padding: '4px 0' }

export type CommentAiSummaryModalProps = {
  open: boolean
  onClose: () => void
  ticketId: number
  summarizeAnchor: SummarizeAnchorRequest
  onAddComment?: (html: string) => Promise<void>
  onAddChecklistItems?: (titles: string[]) => Promise<void>
  onApplyToDescription?: (html: string) => Promise<void>
  addCommentLoading?: boolean
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
}: CommentAiSummaryModalProps) {
  const [loading, setLoading] = useState(false)
  const [summaryItems, setSummaryItems] = useState<string[]>([])
  const [checklistItems, setChecklistItems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<
    'comment' | 'checklist' | 'description' | 'both' | null
  >(null)

  const fetchSummary = useCallback(async () => {
    if (!ticketId) return
    setLoading(true)
    setError(null)
    setSummaryItems([])
    setChecklistItems([])
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments/summarize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          summarizeAnchor.type === 'comment'
            ? { anchor: 'comment', commentId: summarizeAnchor.commentId }
            : { anchor: 'description' }
        ),
      })
      const data = (await res.json()) as {
        summary?: string[]
        checklist?: string[]
        items?: string[]
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate summary')
      }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }, [ticketId, summarizeAnchor])

  const handleAfterOpen = (visible: boolean) => {
    if (visible) void fetchSummary()
    else {
      setSummaryItems([])
      setChecklistItems([])
      setError(null)
      setActionLoading(null)
    }
  }

  const handleAddAsComment = async () => {
    if (summaryItems.length === 0 || !onAddComment) return
    setActionLoading('comment')
    try {
      await onAddComment(summaryItemsToCommentHtml(summaryItems))
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
      }
      if (canChecklist) {
        await onAddChecklistItems(linkifyAiOutputItems(checklistItems))
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

  return (
    <Modal
      title="AI Summary"
      open={open}
      onCancel={onClose}
      afterOpenChange={handleAfterOpen}
      width={880}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      destroyOnClose
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
              disabled={
                busy ||
                (summaryItems.length === 0 && checklistItems.length === 0)
              }
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
            <Text type="secondary">Generating summary…</Text>
          </div>
        </div>
      ) : error ? (
        <Text type="danger">{error}</Text>
      ) : (
        <>
          {summaryItems.length > 0 ? (
            <>
              <Title level={5} style={{ marginTop: 0 }}>
                Summary (comment / description)
              </Title>
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
              <Title level={5} style={{ marginTop: 0 }}>
                Commands (checklist)
              </Title>
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
