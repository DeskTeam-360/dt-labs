'use client'

import { Button, Modal, Typography } from 'antd'

import {
  MESSAGE_TEMPLATE_PREVIEW_SAMPLE_TICKET_ID,
  previewMessageTemplateHtml,
} from '@/lib/message-template-preview'
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

const { Text } = Typography

type MessageTemplatePreviewModalProps = {
  open: boolean
  onClose: () => void
  /** Raw template HTML (merge fields replaced when modal is shown). */
  templateBody: string
  title?: string
}

export default function MessageTemplatePreviewModal({
  open,
  onClose,
  templateBody,
  title = 'Preview (sample data)',
}: MessageTemplatePreviewModalProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://example.com'
  const merged = previewMessageTemplateHtml(templateBody, { origin })
  const previewHtmlSafe = merged ? sanitizeRichHtml(merged) : ''

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          Close
        </Button>
      }
      width={720}
      destroyOnHidden
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Sample recipient <strong>John Recipient</strong>, sender <strong>John Sender</strong>, and ticket{' '}
        <strong>#{MESSAGE_TEMPLATE_PREVIEW_SAMPLE_TICKET_ID}</strong> (links use this site&apos;s origin).
      </Text>
      <div
        className="ql-snow message-template-preview-ql"
        style={{
          border: '1px solid var(--ticket-nav-panel-border)',
          borderRadius: 8,
          padding: 16,
          minHeight: 160,
          background: 'var(--ticket-nav-panel-bg)',
          color: 'var(--foreground)',
        }}
        dangerouslySetInnerHTML={{
          __html:
            previewHtmlSafe ||
            '<p style="margin:0;color:var(--ticket-nav-muted)"><em>No body yet.</em></p>',
        }}
      />
    </Modal>
  )
}
