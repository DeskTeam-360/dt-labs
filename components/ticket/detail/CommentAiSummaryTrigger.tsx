'use client'

import { RobotOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useState } from 'react'

import type { SummarizeAnchorRequest } from '@/lib/ticket-comment-summarize'

import CommentAiSummaryModal from './CommentAiSummaryModal'

export type CommentAiSummaryTriggerProps = {
  ticketId: number
  summarizeAnchor: SummarizeAnchorRequest
  onAddComment?: (html: string) => Promise<void>
  onAddChecklistItems?: (titles: string[]) => Promise<void>
  onApplyToDescription?: (html: string) => Promise<void>
  addCommentLoading?: boolean
  disabled?: boolean
  size?: 'small' | 'middle' | 'large'
  tooltip?: string
}

export default function CommentAiSummaryTrigger({
  ticketId,
  summarizeAnchor,
  onAddComment,
  onAddChecklistItems,
  onApplyToDescription,
  addCommentLoading = false,
  disabled = false,
  size = 'middle',
  tooltip = 'AI summary (English)',
}: CommentAiSummaryTriggerProps) {
  const [open, setOpen] = useState(false)

  if (!ticketId || ticketId <= 0) return null
  if (!onAddComment && !onApplyToDescription) return null

  return (
    <>
      <Tooltip title={tooltip}>
        <Button
          icon={<RobotOutlined />}
          size={size}
          disabled={disabled || addCommentLoading}
          onClick={() => setOpen(true)}
          aria-label="AI summary"
        />
      </Tooltip>
      <CommentAiSummaryModal
        open={open}
        onClose={() => setOpen(false)}
        ticketId={ticketId}
        summarizeAnchor={summarizeAnchor}
        addCommentLoading={addCommentLoading}
        onAddComment={onAddComment}
        onAddChecklistItems={onAddChecklistItems}
        onApplyToDescription={onApplyToDescription}
      />
    </>
  )
}
