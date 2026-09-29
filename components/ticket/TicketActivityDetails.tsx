'use client'

import { Button, Modal, Table, Typography } from 'antd'
import { useState } from 'react'

import CommentHtml from '@/components/ticket/detail/CommentHtml'
import {
  summarizeTicketActivityMetadata,
  ticketActivityAttachmentChanges,
  type TicketActivityChangeRow,
  ticketActivityChangeRows,
} from '@/lib/ticket-activity-metadata'

const { Text } = Typography

function ChangeValue({ row, value }: { row: TicketActivityChangeRow; value: string }) {
  if (value === 'None') return <Text type="secondary" italic>None</Text>
  if (row.isHtml) {
    return (
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        <CommentHtml html={value} />
      </div>
    )
  }
  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span>
}

/** Summary line for an activity entry, with a "Show details" dialog listing every field change in full. */
export default function TicketActivityDetails({
  action,
  metadata,
  title,
}: {
  action: string
  metadata: unknown
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const summary = summarizeTicketActivityMetadata(action, metadata)
  const rows = ticketActivityChangeRows(action, metadata)
  const attachments = action === 'ticket_updated' ? ticketActivityAttachmentChanges(metadata) : null
  const hasAttachmentChanges = !!attachments && (attachments.addedCount > 0 || attachments.removedCount > 0)
  const hasDetails = rows.length > 0 || hasAttachmentChanges

  return (
    <div style={{ minWidth: 0 }}>
      <Text
        type="secondary"
        style={{ fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}
      >
        {summary || '—'}
      </Text>
      {hasDetails && (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        >
          Show details
        </Button>
      )}

      <Modal
        open={open}
        title={title ?? 'Activity details'}
        footer={null}
        width={860}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <div onClick={(e) => e.stopPropagation()}>
          {rows.length > 0 && (
            <Table<TicketActivityChangeRow>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={rows}
              columns={[
                { title: 'Field', dataIndex: 'label', width: 130, render: (v: string) => <Text strong>{v}</Text> },
                { title: 'Before', key: 'from', render: (_, r) => <ChangeValue row={r} value={r.from} /> },
                { title: 'After', key: 'to', render: (_, r) => <ChangeValue row={r} value={r.to} /> },
              ]}
            />
          )}
          {hasAttachmentChanges && attachments && (
            <div style={{ marginTop: rows.length > 0 ? 16 : 0 }}>
              {attachments.addedCount > 0 && (
                <div>
                  <Text strong>Files added: </Text>
                  <Text>{attachments.added.length ? attachments.added.join(', ') : `${attachments.addedCount} file(s)`}</Text>
                </div>
              )}
              {attachments.removedCount > 0 && (
                <div>
                  <Text strong>Files removed: </Text>
                  <Text>{attachments.removed.length ? attachments.removed.join(', ') : `${attachments.removedCount} file(s)`}</Text>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
